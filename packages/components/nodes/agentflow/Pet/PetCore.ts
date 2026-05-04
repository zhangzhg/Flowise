import {
    ICommonObject,
    IDatabaseEntity,
    INode,
    INodeData,
    INodeOptionsValue,
    INodeParams,
    IServerSideEventStreamer
} from '../../../src/Interface'
import { executeJavaScriptCode } from '../../../src/utils'
import { Embeddings } from '@langchain/core/embeddings'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { DataSource } from 'typeorm'
import { parseTeachingCommand, computePersonalityDelta } from './teachingParser'
import { findTopMatches, StoredCard } from './matcher'
import { deriveStage, deriveLevel } from './stage'
import { buildEggResponse, buildBabbleResponse, buildFewShotMessages, selectStagePrompt, ToolDef } from './responder'
import { applyTurnDrift, consolidateSession } from './personalityDrift'

interface ToolCall {
    name: string
    params: Record<string, any>
    executor: string
}

interface ParsedResponse {
    speech: string
    toolCall?: ToolCall
}

function parseToolResponse(raw: string, tools: ToolDef[]): ParsedResponse {
    const trimmed = (raw || '').trim()
    const tryParse = (s: string): ParsedResponse | null => {
        try {
            const obj = JSON.parse(s)
            if (typeof obj.speech === 'string') {
                const toolCall = obj.tool?.name
                    ? {
                          name: obj.tool.name,
                          params: obj.tool.params ?? {},
                          executor: tools.find((t) => t.name === obj.tool.name)?.executor ?? 'client'
                      }
                    : undefined
                return { speech: obj.speech, toolCall }
            }
        } catch {
            console.error('Error parsing tool response:', s)
        }
        return null
    }
    // Layer 1: direct parse
    const direct = tryParse(trimmed)
    if (direct) return direct
    // Layer 2: extract first {...} block containing "speech"
    const match = trimmed.match(/\{[\s\S]*?"speech"[\s\S]*?\}/)
    if (match) {
        const extracted = tryParse(match[0])
        if (extracted) return extracted
    }
    // Layer 3: plain text fallback
    return { speech: trimmed }
}

const ECHO_RECALL_TOPK = 5
const CHAT_RECALL_TOPK = 5
const ACTION_TOPK = 3
const ACTION_THRESHOLD = 0.72

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
                type: 'asyncOptions',
                loadMethod: 'listTools',
                loadConfig: true,
                optional: true,
                list: true,
                description:
                    'Flowise tools the pet can invoke at mature stage (server-side). TTS is always available as a built-in client tool.'
            }
        ]
    }

    //@ts-ignore
    loadMethods = {
        async listEmbeddings(_: INodeData, options: ICommonObject): Promise<INodeOptionsValue[]> {
            const componentNodes = options.componentNodes as { [key: string]: INode }
            const returnOptions: INodeOptionsValue[] = []
            for (const nodeName in componentNodes) {
                const node = componentNodes[nodeName]
                if (node.category === 'Embeddings' && !node.tags?.includes('LlamaIndex')) {
                    returnOptions.push({ label: node.label, name: nodeName, imageSrc: node.icon })
                }
            }
            return returnOptions
        },
        async listChatModels(_: INodeData, options: ICommonObject): Promise<INodeOptionsValue[]> {
            const componentNodes = options.componentNodes as { [key: string]: INode }
            const returnOptions: INodeOptionsValue[] = []
            for (const nodeName in componentNodes) {
                const node = componentNodes[nodeName]
                if (node.category === 'Chat Models' && !node.tags?.includes('LlamaIndex')) {
                    returnOptions.push({ label: node.label, name: nodeName, imageSrc: node.icon })
                }
            }
            return returnOptions
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

    async run(nodeData: INodeData, input: string | Record<string, any>, options: ICommonObject): Promise<any> {
        const embeddingModelName = nodeData.inputs?.petEmbeddingModel as string
        const embeddingModelConfig = nodeData.inputs?.petEmbeddingModelConfig as ICommonObject
        const chatModelName = nodeData.inputs?.petChatModel as string
        const chatModelConfig = nodeData.inputs?.petChatModelConfig as ICommonObject
        // TTS is always available as a built-in client tool at mature stage
        const builtinTools: ToolDef[] = [
            {
                name: 'tts',
                description: '朗读文字。支持单条文字或多条列表循环朗读（如背单词）。',
                executor: 'client',
                params: {
                    texts: { type: 'string[]', description: '要朗读的文字列表，单词或句子均可。例如 ["cat","map","cap"]' },
                    times: { type: 'number', description: '整组循环次数', default: 1 },
                    rate: { type: 'number', description: '语速 0.5慢~2.0快', default: 1.0 },
                    interval: { type: 'number', description: '相邻条目之间的间隔毫秒', default: 300 }
                }
            }
        ]
        // userId: explicit input → overrideConfig.petUserId → overrideConfig.userId
        const overrideConfig = (options.overrideConfig ?? {}) as ICommonObject
        let userId =
            ((nodeData.inputs?.petUserId as string) || '').trim() ||
            ((overrideConfig.petUserId as string) || '').trim() ||
            ((overrideConfig.userId as string) || '').trim()
        let userText = ((nodeData.inputs?.petInput as string) || (typeof input === 'string' ? input : '')).trim()

        // Detect schedule-fired trigger context: when an agent-created schedule fires,
        // executeAgentFlow passes the trigger context as JSON. Extract `prompt` and
        // `userId` so the Pet node behaves as if the user typed the saved prompt.
        if (userText.startsWith('{') && userText.includes('"prompt"')) {
            try {
                const ctx = JSON.parse(userText)
                if (typeof ctx.prompt === 'string' && ctx.prompt.trim()) userText = ctx.prompt.trim()
                if (typeof ctx.userId === 'string' && !userId) userId = ctx.userId
            } catch {
                console.error('Error parsing schedule trigger context:', userText)
            }
        }

        if (!embeddingModelName) throw new Error('Pet node: Embedding Model is required')
        if (!userId) throw new Error('Pet node: User ID is required (set petUserId input or pass overrideConfig.petUserId)')
        if (!userText) throw new Error('Pet node: Pet Input is required')

        const appDataSource = options.appDataSource as DataSource
        const databaseEntities = options.databaseEntities as IDatabaseEntity
        const chatId = options.chatId as string
        const sseStreamer: IServerSideEventStreamer | undefined = options.sseStreamer
        const isLastNode = options.isLastNode as boolean

        // Instantiate embedding model
        const embFilePath = options.componentNodes[embeddingModelName].filePath as string
        const embModule = await import(embFilePath)
        const embInstance = new embModule.nodeClass()
        const embNodeData = {
            ...nodeData,
            credential: embeddingModelConfig?.['FLOWISE_CREDENTIAL_ID'],
            inputs: { ...nodeData.inputs, ...embeddingModelConfig }
        }
        const embeddings = (await embInstance.init(embNodeData, '', options)) as Embeddings

        // Instantiate chat model (optional)
        let chatModel: BaseChatModel | undefined
        if (chatModelName) {
            const chatFilePath = options.componentNodes[chatModelName].filePath as string
            const chatModule = await import(chatFilePath)
            const chatInstance = new chatModule.nodeClass()
            const chatNodeData = {
                ...nodeData,
                credential: chatModelConfig?.['FLOWISE_CREDENTIAL_ID'],
                inputs: { ...nodeData.inputs, ...chatModelConfig }
            }
            chatModel = (await chatInstance.init(chatNodeData, '', options)) as BaseChatModel
        }

        // Load pet from DB
        const petRepo = appDataSource.getRepository(databaseEntities['Pet'])
        const pet = await petRepo.findOne({ where: { userId } })
        if (!pet) throw new Error(`Pet not found for userId=${userId}. Please create a pet first.`)

        const cardRepo = appDataSource.getRepository(databaseEntities['Card'])
        const eventRepo = databaseEntities['PetPersonalityEvent']
            ? appDataSource.getRepository(databaseEntities['PetPersonalityEvent'])
            : null

        // Load selected server tools from DB (built-in tools are seeded by server startup)
        const toolRepo = appDataSource.getRepository(databaseEntities['Tool'])
        const selectedToolIds = (nodeData.inputs?.petServerTools as string[] | string | undefined) ?? []
        const selectedIdList = Array.isArray(selectedToolIds)
            ? selectedToolIds
            : typeof selectedToolIds === 'string' && selectedToolIds
            ? [selectedToolIds]
            : []
        const dbToolEntities: any[] = selectedIdList.length ? await toolRepo.findByIds(selectedIdList) : []
        const serverTools: ToolDef[] = dbToolEntities.map((t: any) => ({
            name: t.name,
            description: t.description ?? t.name,
            executor: 'server',
            params: {}
        }))
        const petTools: ToolDef[] = [...builtinTools, ...serverTools]

        // Context passed into server-tool sandbox; tools can call internal APIs
        // (e.g. /api/v1/pet/me/schedules) on the user's behalf using $ctx.
        const toolCtx = {
            chatflowId: options.chatflowid as string,
            userId,
            workspaceId: (options.workspaceId as string) || '',
            baseURL: (options.baseURL as string) || process.env.FLOWISE_URL || 'http://localhost:3000',
            apiKey: (options.apiKey as string) || ''
        }

        // Session change detection: if chatId differs from last session, consolidate previous session
        if (eventRepo && chatId) {
            const attrs = this.parseJson(pet.attributes) as { [k: string]: any }
            const lastChatId = attrs._lastChatId as string | undefined
            if (lastChatId && lastChatId !== chatId) {
                consolidateSession({ petId: pet.id, petRepo, eventRepo, sessionChatId: lastChatId }).catch(() => {})
            }
            if (lastChatId !== chatId) {
                attrs._lastChatId = chatId
                await petRepo.update(pet.id, { attributes: JSON.stringify(attrs) })
                pet.attributes = JSON.stringify(attrs)
            }
        }

        // Parse possible teaching command
        const parsed = parseTeachingCommand(userText)
        if (parsed) {
            return await this.handleTeach(parsed, pet, petRepo, cardRepo, embeddings, userText, nodeData, chatId, sseStreamer, isLastNode)
        }

        return await this.handleChat(
            userText,
            pet,
            petRepo,
            cardRepo,
            embeddings,
            chatModel,
            eventRepo,
            nodeData,
            chatId,
            sseStreamer,
            isLastNode,
            options,
            petTools,
            dbToolEntities,
            toolCtx
        )
    }

    private async handleTeach(
        parsed: ReturnType<typeof parseTeachingCommand> & object,
        pet: any,
        petRepo: any,
        cardRepo: any,
        embeddings: Embeddings,
        userText: string,
        nodeData: INodeData,
        chatId: string,
        sseStreamer: IServerSideEventStreamer | undefined,
        isLastNode: boolean
    ) {
        // Embed the input text for the card
        const [embeddingVec] = await embeddings.embedDocuments([parsed!.input])

        // Persist card
        const card = cardRepo.create({
            petId: pet.id,
            cardType: parsed!.cardType,
            input: parsed!.input,
            output: parsed!.output,
            intentLabel: parsed!.cardType === 'action' ? parsed!.output : null,
            traitTags: JSON.stringify(parsed!.traitTags),
            embedding: JSON.stringify(embeddingVec)
        })
        await cardRepo.save(card)

        // Update pet attributes (cardCount/exp/level live in attrs, not growthCycle)
        const attrs = this.parseJson(pet.attributes) as { [k: string]: number }
        const personalityVec = this.parseJson(pet.personalityVector) as number[]

        const delta = computePersonalityDelta(parsed!.traitTags)
        const newPersonality = personalityVec.map((v, i) => Math.max(-1, Math.min(1, v + (delta[i] ?? 0) * 0.05)))

        attrs.cardCount = (attrs.cardCount || 0) + 1
        attrs.exp = (attrs.exp || 0) + 10
        attrs.level = deriveLevel(attrs.exp)
        attrs.hunger = Math.max(0, (attrs.hunger ?? 100) - 5)

        await petRepo.update(pet.id, {
            attributes: JSON.stringify(attrs),
            personalityVector: JSON.stringify(newPersonality)
        })

        const replyMap: Record<string, string> = {
            vocab: '咕！记住了！',
            phrase: '嗯！学会了！',
            action: '好的！我知道怎么做了！'
        }
        const responseText = replyMap[parsed!.cardType] ?? '学会了！'

        return this.buildReturn(responseText, nodeData, userText, chatId, sseStreamer, isLastNode)
    }

    private async handleChat(
        userText: string,
        pet: any,
        petRepo: any,
        cardRepo: any,
        embeddings: Embeddings,
        chatModel: BaseChatModel | undefined,
        eventRepo: any,
        nodeData: INodeData,
        chatId: string,
        sseStreamer: IServerSideEventStreamer | undefined,
        isLastNode: boolean,
        options: ICommonObject,
        petTools: ToolDef[] = [],
        dbToolEntities: any[] = [],
        toolCtx: Record<string, any> = {}
    ) {
        const attrs = this.parseJson(pet.attributes) as { [k: string]: number }
        const cardCount = attrs.cardCount || 0
        const chatTurns = attrs.chatTurns || 0
        const stage = deriveStage(cardCount, chatTurns)

        // Increment chatTurns (fire-and-forget, don't block response)
        petRepo
            .update(pet.id, {
                attributes: JSON.stringify({ ...attrs, chatTurns: chatTurns + 1 })
            })
            .catch(() => {})

        // Egg stage: no progress yet
        if (stage === 'egg') {
            const resp = buildEggResponse()
            return this.buildReturn(resp.text, nodeData, userText, chatId, sseStreamer, isLastNode)
        }

        // Embed user query
        const [queryEmbedding] = await embeddings.embedDocuments([userText])

        // Load all cards for this pet
        const allCards: StoredCard[] = await cardRepo.find({ where: { petId: pet.id } })
        const nonActionCards = allCards.filter((c: StoredCard) => c.cardType !== 'action')
        const actionCards = allCards.filter((c: StoredCard) => c.cardType === 'action')

        // Check for action intent match — unified toolCall format
        const actionMatches = findTopMatches(queryEmbedding, actionCards, ACTION_TOPK, ACTION_THRESHOLD, userText)
        if (actionMatches.length > 0) {
            const intent = actionMatches[0].output
            return this.buildReturn('好的！', nodeData, userText, chatId, sseStreamer, isLastNode, {
                name: intent,
                params: {},
                executor: 'client'
            })
        }

        // Babble stage: direct recall
        if (stage === 'babble') {
            const matches = findTopMatches(queryEmbedding, nonActionCards, ECHO_RECALL_TOPK, 0, userText)
            const resp = buildBabbleResponse(matches)
            return this.buildReturn(resp.text, nodeData, userText, chatId, sseStreamer, isLastNode)
        }

        // Echo/Talk/Mature: LLM-based response
        if (!chatModel) {
            const matches = findTopMatches(queryEmbedding, nonActionCards, ECHO_RECALL_TOPK, 0, userText)
            const resp = buildBabbleResponse(matches)
            return this.buildReturn(resp.text, nodeData, userText, chatId, sseStreamer, isLastNode)
        }

        const topMatches = findTopMatches(queryEmbedding, nonActionCards, CHAT_RECALL_TOPK, 0, userText)
        const recentVocab = await this.getRecentVocab(cardRepo, pet.id, 30)
        const systemPrompt = selectStagePrompt(stage, recentVocab, pet.personalityNarrative, petTools)
        const fewShots = buildFewShotMessages(topMatches)

        const messages: Array<{ role: string; content: string }> = [
            { role: 'system', content: systemPrompt },
            ...fewShots,
            { role: 'user', content: userText }
        ]

        const abortController = options.abortController as AbortController | undefined

        // Mature stage with tools: disable streaming so we can parse structured JSON response
        const hasTools = stage === 'mature' && petTools.length > 0
        let responseText = ''

        if (isLastNode && sseStreamer && !hasTools) {
            for await (const chunk of await chatModel.stream(messages as any, { signal: abortController?.signal })) {
                const token = typeof chunk.content === 'string' ? chunk.content : ''
                sseStreamer.streamTokenEvent(chatId, token)
                responseText += token
            }
            sseStreamer.streamEndEvent(chatId)
            if (eventRepo) {
                applyTurnDrift({ userText, petReply: responseText, stage, chatModel, pet, petRepo, eventRepo, chatId }).catch(() => {})
            }
            return this.buildReturn(responseText, nodeData, userText, chatId, undefined, false)
        } else {
            const response = await chatModel.invoke(messages as any, { signal: abortController?.signal })
            responseText = typeof response.content === 'string' ? response.content : String(response.content)
        }

        if (eventRepo) {
            await applyTurnDrift({ userText, petReply: responseText, stage, chatModel, pet, petRepo, eventRepo, chatId }).catch(() => {})
        }

        if (hasTools) {
            const parsed = parseToolResponse(responseText, petTools)

            if (parsed.toolCall) {
                // Client-side tool: return to frontend for execution
                if (parsed.toolCall.executor === 'client') {
                    if (isLastNode && sseStreamer) {
                        sseStreamer.streamTokenEvent(chatId, parsed.speech)
                        sseStreamer.streamEndEvent(chatId)
                    }
                    return this.buildReturn(parsed.speech, nodeData, userText, chatId, undefined, false, parsed.toolCall)
                }

                // Server-side tool: execute from DB and append result to speech
                if (parsed.toolCall.executor === 'server') {
                    const toolEntity = dbToolEntities.find((t: any) => t.name === parsed.toolCall!.name)
                    if (toolEntity?.func) {
                        try {
                            const inputStr = JSON.stringify(parsed.toolCall.params)
                            const result = await executeJavaScriptCode(
                                toolEntity.func,
                                { input: inputStr, $ctx: toolCtx },
                                { timeout: 15000 }
                            )
                            // Check for client-bridge marker from tool func
                            const resultStr = typeof result === 'string' ? result : JSON.stringify(result)
                            if (resultStr.includes('__client_tool__')) {
                                const clientData = JSON.parse(resultStr)
                                const bridgeCall: ToolCall = {
                                    name: clientData.__client_tool__,
                                    params: clientData,
                                    executor: 'client'
                                }
                                if (isLastNode && sseStreamer) {
                                    sseStreamer.streamTokenEvent(chatId, parsed.speech)
                                    sseStreamer.streamEndEvent(chatId)
                                }
                                return this.buildReturn(parsed.speech, nodeData, userText, chatId, undefined, false, bridgeCall)
                            }
                            // Normal server tool: append result to speech
                            const finalSpeech = resultStr ? `${parsed.speech}\n${resultStr}` : parsed.speech
                            if (isLastNode && sseStreamer) {
                                sseStreamer.streamTokenEvent(chatId, finalSpeech)
                                sseStreamer.streamEndEvent(chatId)
                            }
                            return this.buildReturn(finalSpeech, nodeData, userText, chatId, undefined, false)
                        } catch (e) {
                            const errSpeech = `${parsed.speech}（工具执行失败）`
                            if (isLastNode && sseStreamer) {
                                sseStreamer.streamTokenEvent(chatId, errSpeech)
                                sseStreamer.streamEndEvent(chatId)
                            }
                            return this.buildReturn(errSpeech, nodeData, userText, chatId, undefined, false)
                        }
                    }
                }
            }

            // No toolCall or unrecognised executor: plain speech
            if (isLastNode && sseStreamer) {
                sseStreamer.streamTokenEvent(chatId, parsed.speech)
                sseStreamer.streamEndEvent(chatId)
            }
            return this.buildReturn(parsed.speech, nodeData, userText, chatId, undefined, false)
        }

        return this.buildReturn(responseText, nodeData, userText, chatId, sseStreamer, isLastNode)
    }

    private async getRecentVocab(cardRepo: any, petId: string, limit: number): Promise<string[]> {
        const cards = await cardRepo.find({
            where: { petId },
            order: { createdDate: 'DESC' },
            take: limit
        })
        return (cards as any[]).map((c) => c.input)
    }

    private parseJson(val: string | null | undefined): any {
        if (!val) return {}
        try {
            return JSON.parse(val)
        } catch {
            return {}
        }
    }

    private buildReturn(
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
}

module.exports = { nodeClass: Pet_Agentflow }
