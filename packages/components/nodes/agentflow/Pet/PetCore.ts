import {
    ICommonObject,
    IDatabaseEntity,
    INode,
    INodeData,
    INodeOptionsValue,
    INodeParams,
    IServerSideEventStreamer
} from '../../../src/Interface'
import { Embeddings } from '@langchain/core/embeddings'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { DataSource } from 'typeorm'

import { parseTeachingCommand, ParsedCard } from './teachingParser'
import { computePersonalityDelta, parseVec } from './personality'
import { findTopMatches, StoredCard } from './matcher'
import { deriveStage, deriveLevel, PetStage } from './stage'
import { applyTurnDrift, consolidateSession } from './personalityDrift'
import { buildEggResponse, buildBabbleResponse, buildFewShotMessages, selectStagePrompt } from './responder'
import { ToolCall, ToolCtx, ToolDef, buildToolCtx, buildToolDefs, executeServerTool, parseToolResponse } from './tools'
import { detectScheduleTrigger, detectConsolidateTrigger } from './triggerDetector'
import { buildTeachResponse } from './localizedResponses'
import { consolidateMemories, decayAndRefresh } from './consolidator'
import { retrieveMemories, buildMemorySection } from './memoryRetriever'
import { TEACH_PERSONALITY_WEIGHT, ACTION_TOPK, ECHO_RECALL_TOPK, CHAT_RECALL_TOPK, ACTION_MATCH_THRESHOLD } from './constants'

// ── Internal types ────────────────────────────────────────────────────────────

interface ResolvedInputs {
    embeddingModelName: string
    embeddingModelConfig: ICommonObject
    chatModelName: string
    chatModelConfig: ICommonObject
    selectedToolIds: string[]
    userId: string
    userText: string
}

interface PetState {
    attrs: Record<string, any>
    personalityVec: number[]
}

interface TeachContext {
    parsed: ParsedCard
    pet: any
    state: PetState
    petRepo: any
    cardRepo: any
    embeddings: Embeddings
    nodeData: INodeData
    userText: string
    chatId: string
    sseStreamer: IServerSideEventStreamer | undefined
    isLastNode: boolean
    language: string
}

interface ChatContext {
    userText: string
    pet: any
    state: PetState
    petRepo: any
    cardRepo: any
    embeddings: Embeddings
    chatModel: BaseChatModel | undefined
    eventRepo: any
    messageRepo: any
    memoryRepo: any
    nodeData: INodeData
    chatId: string
    sseStreamer: IServerSideEventStreamer | undefined
    isLastNode: boolean
    options: ICommonObject
    petTools: ToolDef[]
    toolEntityMap: Map<string, any>
    toolCtx: ToolCtx
    language: string
}

// ── Node ──────────────────────────────────────────────────────────────────────

class Pet_Agentflow implements INode {
    label: string
    name: string
    version: number
    description: string
    type: string
    icon: string
    category: string
    color: string
    baseClasses: string[]
    inputs: INodeParams[]

    constructor() {
        this.label = 'Pet'
        this.name = 'petAgentflow'
        this.version = 1.0
        this.type = 'Pet'
        this.category = 'Agent Flows'
        this.icon = 'Pet.svg'
        this.description = 'AI pet that grows and learns from user interactions'
        this.color = '#FFD700'
        this.baseClasses = [this.type]
        this.inputs = [
            {
                label: 'Embedding Model',
                name: 'petEmbeddingModel',
                type: 'asyncOptions',
                loadMethod: 'listEmbeddings',
                loadConfig: true
            },
            {
                label: 'Chat Model',
                name: 'petChatModel',
                type: 'asyncOptions',
                loadMethod: 'listChatModels',
                loadConfig: true,
                optional: true
            },
            {
                label: 'User ID',
                name: 'petUserId',
                type: 'string',
                acceptVariable: true,
                optional: true,
                description: 'User ID to identify which pet. Auto-resolved from overrideConfig.petUserId when called via PetPage.'
            },
            {
                label: 'Pet Input',
                name: 'petInput',
                type: 'string',
                acceptVariable: true,
                rows: 2,
                description: 'User message to the pet'
            },
            {
                label: 'Server Tools (mature stage)',
                name: 'petServerTools',
                type: 'asyncMultiOptions',
                loadMethod: 'listTools',
                optional: true,
                description:
                    'Flowise tools the pet can invoke at mature stage. Tool descriptions and parameter schemas are loaded from the Tools page.'
            }
        ]
    }

    //@ts-ignore
    loadMethods = {
        async listEmbeddings(_: INodeData, options: ICommonObject): Promise<INodeOptionsValue[]> {
            const componentNodes = options.componentNodes as { [key: string]: INode }
            return Object.values(componentNodes)
                .filter((n) => n.category === 'Embeddings' && !n.tags?.includes('LlamaIndex'))
                .map((n) => ({ label: n.label, name: n.name, imageSrc: n.icon }))
        },

        async listChatModels(_: INodeData, options: ICommonObject): Promise<INodeOptionsValue[]> {
            const componentNodes = options.componentNodes as { [key: string]: INode }
            return Object.values(componentNodes)
                .filter((n) => n.category === 'Chat Models' && !n.tags?.includes('LlamaIndex'))
                .map((n) => ({ label: n.label, name: n.name, imageSrc: n.icon }))
        },

        async listTools(_: INodeData, options: ICommonObject): Promise<INodeOptionsValue[]> {
            const appDataSource = options.appDataSource as DataSource
            const databaseEntities = options.databaseEntities as IDatabaseEntity
            if (!appDataSource) return []
            const searchOptions = options.searchOptions || {}
            const tools = await appDataSource.getRepository(databaseEntities['Tool']).findBy(searchOptions)
            return tools.map((t: any) => ({ label: t.name, name: t.id, description: t.description }))
        }
    }

    // ── Entrypoint ────────────────────────────────────────────────────────────

    async run(nodeData: INodeData, input: string | Record<string, any>, options: ICommonObject): Promise<any> {
        const inputs = this.resolveInputs(nodeData, input, options)

        if (!inputs.embeddingModelName) throw new Error('Pet node: Embedding Model is required')
        if (!inputs.userId) throw new Error('Pet node: User ID is required (set petUserId input or pass overrideConfig.petUserId)')
        if (!inputs.userText) throw new Error('Pet node: Pet Input is required')

        const appDataSource = options.appDataSource as DataSource
        const databaseEntities = options.databaseEntities as IDatabaseEntity
        const chatId = options.chatId as string
        const sseStreamer = options.sseStreamer as IServerSideEventStreamer | undefined
        const isLastNode = options.isLastNode as boolean

        const embeddings = await this.instantiateModel<Embeddings>(
            inputs.embeddingModelName,
            inputs.embeddingModelConfig,
            nodeData,
            options
        )
        const chatModel = inputs.chatModelName
            ? await this.instantiateModel<BaseChatModel>(inputs.chatModelName, inputs.chatModelConfig, nodeData, options)
            : undefined

        const petRepo = appDataSource.getRepository(databaseEntities['Pet'])
        const cardRepo = appDataSource.getRepository(databaseEntities['Card'])
        const eventRepo = databaseEntities['PetPersonalityEvent']
            ? appDataSource.getRepository(databaseEntities['PetPersonalityEvent'])
            : null
        const messageRepo = databaseEntities['PetChatMessage'] ? appDataSource.getRepository(databaseEntities['PetChatMessage']) : null
        const memoryRepo = databaseEntities['PetMemory'] ? appDataSource.getRepository(databaseEntities['PetMemory']) : null

        const pet = await petRepo.findOne({ where: { userId: inputs.userId } })
        if (!pet) throw new Error(`Pet not found for userId=${inputs.userId}. Please create a pet first.`)

        const state = this.parsePetState(pet)
        const language = (pet.language as string) || 'zh'

        const toolRepo = appDataSource.getRepository(databaseEntities['Tool'])
        const dbToolEntities: any[] = inputs.selectedToolIds.length ? await toolRepo.findByIds(inputs.selectedToolIds) : []
        const { defs: petTools, map: toolEntityMap } = buildToolDefs(dbToolEntities)
        const toolCtx = buildToolCtx(options, inputs.userId)

        // Background consolidation-only trigger from MemoryConsolidator cron
        if (detectConsolidateTrigger(inputs.userText)) {
            if (messageRepo && memoryRepo && chatModel) {
                await consolidateMemories({ petId: pet.id, petName: pet.name, chatModel, embeddings, messageRepo, memoryRepo })
                decayAndRefresh({ petId: pet.id, memoryRepo, petRepo, chatModel }).catch(() => {})
            }
            return this.buildReturn('', nodeData, inputs.userText)
        }

        await this.handleSessionChange(eventRepo, messageRepo, memoryRepo, embeddings, chatModel, petRepo, pet, state.attrs, chatId)

        const teaching = parseTeachingCommand(inputs.userText)
        if (teaching) {
            return await this.handleTeach({
                parsed: teaching,
                pet,
                state,
                petRepo,
                cardRepo,
                embeddings,
                nodeData,
                userText: inputs.userText,
                chatId,
                sseStreamer,
                isLastNode,
                language
            })
        }

        return await this.handleChat({
            userText: inputs.userText,
            pet,
            state,
            petRepo,
            cardRepo,
            embeddings,
            chatModel,
            eventRepo,
            messageRepo,
            memoryRepo,
            nodeData,
            chatId,
            sseStreamer,
            isLastNode,
            options,
            petTools,
            toolEntityMap,
            toolCtx,
            language
        })
    }

    // ── Setup helpers ─────────────────────────────────────────────────────────

    private resolveInputs(nodeData: INodeData, input: string | Record<string, any>, options: ICommonObject): ResolvedInputs {
        const overrideConfig = (options.overrideConfig ?? {}) as ICommonObject

        let userId =
            ((nodeData.inputs?.petUserId as string) || '').trim() ||
            ((overrideConfig.petUserId as string) || '').trim() ||
            ((overrideConfig.userId as string) || '').trim()

        let userText = ((nodeData.inputs?.petInput as string) || (typeof input === 'string' ? input : '')).trim()

        const trigger = detectScheduleTrigger(userText)
        if (trigger) {
            userText = trigger.prompt
            if (!userId && trigger.userId) userId = trigger.userId
        }

        // Consolidation-only trigger: extract userId but keep userText unchanged (marker for run())
        const consolidateTrigger = detectConsolidateTrigger(userText)
        if (consolidateTrigger && !userId) {
            userId = consolidateTrigger.userId
        }

        const selectedRaw = nodeData.inputs?.petServerTools as string[] | string | undefined
        let selectedToolIds: string[]
        if (Array.isArray(selectedRaw)) {
            selectedToolIds = selectedRaw
        } else if (typeof selectedRaw === 'string' && selectedRaw) {
            try {
                const parsed = JSON.parse(selectedRaw)
                selectedToolIds = Array.isArray(parsed) ? parsed : [selectedRaw]
            } catch {
                selectedToolIds = [selectedRaw]
            }
        } else {
            selectedToolIds = []
        }

        return {
            embeddingModelName: nodeData.inputs?.petEmbeddingModel as string,
            embeddingModelConfig: (nodeData.inputs?.petEmbeddingModelConfig as ICommonObject) ?? {},
            chatModelName: nodeData.inputs?.petChatModel as string,
            chatModelConfig: (nodeData.inputs?.petChatModelConfig as ICommonObject) ?? {},
            selectedToolIds,
            userId,
            userText
        }
    }

    private async instantiateModel<T>(name: string, config: ICommonObject, nodeData: INodeData, options: ICommonObject): Promise<T> {
        const filePath = options.componentNodes[name].filePath as string
        const mod = await import(filePath)
        const inst = new mod.nodeClass()
        const enriched = {
            ...nodeData,
            credential: config?.['FLOWISE_CREDENTIAL_ID'],
            inputs: { ...nodeData.inputs, ...config }
        }
        return (await inst.init(enriched, '', options)) as T
    }

    private parsePetState(pet: any): PetState {
        let attrs: Record<string, any> = {}
        try {
            attrs = pet.attributes ? JSON.parse(pet.attributes) : {}
        } catch {
            attrs = {}
        }
        return { attrs, personalityVec: parseVec(pet.personalityVector) }
    }

    private async handleSessionChange(
        eventRepo: any,
        messageRepo: any,
        memoryRepo: any,
        embeddings: Embeddings,
        chatModel: BaseChatModel | undefined,
        petRepo: any,
        pet: any,
        attrs: Record<string, any>,
        chatId: string
    ): Promise<void> {
        if (!chatId) return

        const lastChatId = attrs._lastChatId as string | undefined
        if (lastChatId && lastChatId !== chatId) {
            // Personality drift consolidation (existing)
            if (eventRepo) consolidateSession({ petId: pet.id, petRepo, eventRepo, sessionChatId: lastChatId }).catch(() => {})

            // P1: Memory consolidation — trigger when session changes
            if (messageRepo && memoryRepo && chatModel) {
                consolidateMemories({
                    petId: pet.id,
                    petName: pet.name,
                    chatModel,
                    embeddings,
                    messageRepo,
                    memoryRepo
                })
                    .then((saved) => {
                        if (saved > 0 && memoryRepo) {
                            // P3/P4: decay + narrative refresh after new memories are saved
                            decayAndRefresh({ petId: pet.id, memoryRepo, petRepo, chatModel }).catch(() => {})
                        }
                    })
                    .catch(() => {})
            }
        }
        if (lastChatId !== chatId) {
            attrs._lastChatId = chatId
            await petRepo.update(pet.id, { attributes: JSON.stringify(attrs) })
            pet.attributes = JSON.stringify(attrs)
        }
    }

    // ── Teach flow ────────────────────────────────────────────────────────────

    private async handleTeach(ctx: TeachContext) {
        const { parsed, pet, state, petRepo, cardRepo, embeddings, nodeData, userText, chatId, sseStreamer, isLastNode, language } = ctx

        const [embeddingVec] = await embeddings.embedDocuments([parsed.input])

        const card = cardRepo.create({
            petId: pet.id,
            cardType: parsed.cardType,
            input: parsed.input,
            output: parsed.output,
            intentLabel: parsed.cardType === 'action' ? parsed.output : null,
            traitTags: JSON.stringify(parsed.traitTags),
            embedding: JSON.stringify(embeddingVec)
        })
        await cardRepo.save(card)

        const delta = computePersonalityDelta(parsed.traitTags)
        const newPersonality = state.personalityVec.map((v, i) => Math.max(-1, Math.min(1, v + (delta[i] ?? 0) * TEACH_PERSONALITY_WEIGHT)))

        state.attrs.cardCount = (state.attrs.cardCount || 0) + 1
        state.attrs.exp = (state.attrs.exp || 0) + 10
        state.attrs.level = deriveLevel(state.attrs.exp)
        state.attrs.hunger = Math.max(0, (state.attrs.hunger ?? 100) - 5)

        await petRepo.update(pet.id, {
            attributes: JSON.stringify(state.attrs),
            personalityVector: JSON.stringify(newPersonality)
        })

        return this.respond(buildTeachResponse(parsed.cardType, language), nodeData, userText, chatId, sseStreamer, isLastNode)
    }

    // ── Chat flow ─────────────────────────────────────────────────────────────

    private async handleChat(ctx: ChatContext) {
        const {
            userText,
            pet,
            state,
            petRepo,
            cardRepo,
            embeddings,
            chatModel,
            eventRepo,
            messageRepo,
            memoryRepo,
            nodeData,
            chatId,
            sseStreamer,
            isLastNode,
            options,
            petTools,
            toolEntityMap,
            toolCtx,
            language
        } = ctx

        const cardCount = state.attrs.cardCount || 0
        const chatTurns = state.attrs.chatTurns || 0
        const stage = deriveStage(cardCount, chatTurns)

        // P1: Save user message asynchronously
        if (messageRepo && chatId) {
            messageRepo
                .save(messageRepo.create({ petId: pet.id, chatId, role: 'user', content: userText, consolidated: false }))
                .catch(() => {})
        }

        // Increment chatTurns asynchronously — don't block response
        petRepo.update(pet.id, { attributes: JSON.stringify({ ...state.attrs, chatTurns: chatTurns + 1 }) }).catch(() => {})

        if (stage === 'egg') {
            return this.respond(buildEggResponse(language).text, nodeData, userText, chatId, sseStreamer, isLastNode)
        }

        const [queryEmbedding] = await embeddings.embedDocuments([userText])

        const allCards: StoredCard[] = await cardRepo.find({ where: { petId: pet.id } })
        const nonActionCards = allCards.filter((c) => c.cardType !== 'action')
        const actionCards = allCards.filter((c) => c.cardType === 'action')

        // Action card → intent toolCall (client-side)
        const actionMatches = findTopMatches(queryEmbedding, actionCards, ACTION_TOPK, ACTION_MATCH_THRESHOLD, userText)
        if (actionMatches.length > 0) {
            return this.respond('好的！', nodeData, userText, chatId, sseStreamer, isLastNode, {
                name: actionMatches[0].output,
                params: {},
                executor: 'client'
            })
        }

        // Babble or no chat model → direct recall
        if (stage === 'babble' || !chatModel) {
            const matches = findTopMatches(queryEmbedding, nonActionCards, ECHO_RECALL_TOPK, 0, userText)
            return this.respond(buildBabbleResponse(matches, language).text, nodeData, userText, chatId, sseStreamer, isLastNode)
        }

        // P2: Retrieve memories for talk/mature stages
        let memorySection = ''
        if (memoryRepo && (stage === 'talk' || stage === 'mature')) {
            const { highConf, midConf } = await retrieveMemories({ queryVec: queryEmbedding, petId: pet.id, memoryRepo })
            memorySection = buildMemorySection(highConf, midConf)
        }

        // Echo / Talk / Mature: LLM-driven
        const topMatches = findTopMatches(queryEmbedding, nonActionCards, CHAT_RECALL_TOPK, 0, userText)
        const recentVocab = await this.getRecentVocab(cardRepo, pet.id, 30)
        const messages: Array<{ role: string; content: string }> = [
            { role: 'system', content: selectStagePrompt(stage, recentVocab, pet.personalityNarrative, petTools, memorySection) },
            ...buildFewShotMessages(topMatches),
            { role: 'user', content: userText }
        ]

        const abortController = options.abortController as AbortController | undefined
        const hasTools = stage === 'mature' && petTools.length > 0

        // Streaming path: only when no tools (tools require structured JSON)
        if (isLastNode && sseStreamer && !hasTools) {
            let responseText = ''
            for await (const chunk of await chatModel.stream(messages as any, { signal: abortController?.signal })) {
                const token = typeof chunk.content === 'string' ? chunk.content : ''
                sseStreamer.streamTokenEvent(chatId, token)
                responseText += token
            }
            sseStreamer.streamEndEvent(chatId)
            this.fireDriftAsync(eventRepo, userText, responseText, stage, chatModel, pet, petRepo, chatId)
            // P1: Save assistant reply
            if (messageRepo && chatId) {
                messageRepo
                    .save(messageRepo.create({ petId: pet.id, chatId, role: 'assistant', content: responseText, consolidated: false }))
                    .catch(() => {})
            }
            return this.buildReturn(responseText, nodeData, userText)
        }

        // Non-streaming path
        const response = await chatModel.invoke(messages as any, { signal: abortController?.signal })
        const responseText = typeof response.content === 'string' ? response.content : String(response.content)

        this.fireDriftAsync(eventRepo, userText, responseText, stage, chatModel, pet, petRepo, chatId)

        if (!hasTools) {
            // P1: Save assistant reply
            if (messageRepo && chatId) {
                messageRepo
                    .save(messageRepo.create({ petId: pet.id, chatId, role: 'assistant', content: responseText, consolidated: false }))
                    .catch(() => {})
            }
            return this.respond(responseText, nodeData, userText, chatId, sseStreamer, isLastNode)
        }

        const toolResult = await this.handleToolResponse(
            responseText,
            petTools,
            toolEntityMap,
            toolCtx,
            nodeData,
            userText,
            chatId,
            sseStreamer,
            isLastNode
        )
        // P1: Save assistant reply (speech portion only, not the raw JSON)
        if (messageRepo && chatId) {
            const speechContent = (toolResult as any)?.output?.content ?? responseText
            messageRepo
                .save(messageRepo.create({ petId: pet.id, chatId, role: 'assistant', content: speechContent, consolidated: false }))
                .catch(() => {})
        }
        return toolResult
    }

    private async handleToolResponse(
        responseText: string,
        petTools: ToolDef[],
        toolEntityMap: Map<string, any>,
        toolCtx: ToolCtx,
        nodeData: INodeData,
        userText: string,
        chatId: string,
        sseStreamer: IServerSideEventStreamer | undefined,
        isLastNode: boolean
    ) {
        const parsed = parseToolResponse(responseText, petTools)

        if (!parsed.toolCall) {
            return this.respond(parsed.speech, nodeData, userText, chatId, sseStreamer, isLastNode)
        }

        if (parsed.toolCall.executor === 'client') {
            return this.respond(parsed.speech, nodeData, userText, chatId, sseStreamer, isLastNode, parsed.toolCall)
        }

        if (parsed.toolCall.executor === 'server') {
            const toolEntity = toolEntityMap.get(parsed.toolCall.name)
            const result = await executeServerTool({
                toolEntity,
                speech: parsed.speech,
                toolParams: parsed.toolCall.params,
                ctx: toolCtx
            })
            return this.respond(result.speech, nodeData, userText, chatId, sseStreamer, isLastNode, result.toolCall)
        }

        return this.respond(parsed.speech, nodeData, userText, chatId, sseStreamer, isLastNode)
    }

    private fireDriftAsync(
        eventRepo: any,
        userText: string,
        petReply: string,
        stage: PetStage,
        chatModel: BaseChatModel,
        pet: any,
        petRepo: any,
        chatId: string
    ): void {
        if (!eventRepo) return
        applyTurnDrift({ userText, petReply, stage, chatModel, pet, petRepo, eventRepo, chatId }).catch(() => {})
    }

    // ── Response helpers ──────────────────────────────────────────────────────

    /** Stream-if-needed + build node return payload. */
    private respond(
        text: string,
        nodeData: INodeData,
        userText: string,
        chatId: string,
        sseStreamer: IServerSideEventStreamer | undefined,
        isLastNode: boolean,
        toolCall?: ToolCall
    ) {
        if (isLastNode && sseStreamer) {
            sseStreamer.streamTokenEvent(chatId, text)
            sseStreamer.streamEndEvent(chatId)
        }
        return this.buildReturn(text, nodeData, userText, toolCall)
    }

    /** Pure return payload — no side effects. Used when streaming was already handled. */
    private buildReturn(text: string, nodeData: INodeData, userText: string, toolCall?: ToolCall) {
        return {
            id: nodeData.id,
            name: this.name,
            input: { userText },
            output: { content: text, toolCall },
            state: {},
            chatHistory: [
                { role: 'user', content: userText },
                { role: 'assistant', content: text }
            ]
        }
    }

    private async getRecentVocab(cardRepo: any, petId: string, limit: number): Promise<string[]> {
        const cards = await cardRepo.find({ where: { petId }, order: { createdDate: 'DESC' }, take: limit })
        return (cards as any[]).map((c) => c.input)
    }
}

module.exports = { nodeClass: Pet_Agentflow }
