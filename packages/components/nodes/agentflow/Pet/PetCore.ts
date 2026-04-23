import { ICommonObject, INode, INodeData, INodeOptionsValue, INodeParams, IServerSideEventStreamer } from '../../../src/Interface'
import { Embeddings } from '@langchain/core/embeddings'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { DataSource } from 'typeorm'
import { parseTeachingCommand, computePersonalityDelta } from './teachingParser'
import { findTopMatches, StoredCard } from './matcher'
import { deriveStage, deriveLevel } from './stage'
import { buildEggResponse, buildBabbleResponse, buildFewShotMessages, selectStagePrompt } from './responder'

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
        }
    }

    async run(nodeData: INodeData, input: string | Record<string, any>, options: ICommonObject): Promise<any> {
        const embeddingModelName = nodeData.inputs?.petEmbeddingModel as string
        const embeddingModelConfig = nodeData.inputs?.petEmbeddingModelConfig as ICommonObject
        const chatModelName = nodeData.inputs?.petChatModel as string
        const chatModelConfig = nodeData.inputs?.petChatModelConfig as ICommonObject
        // userId: explicit input → overrideConfig.petUserId → overrideConfig.userId
        const overrideConfig = (options.overrideConfig ?? {}) as ICommonObject
        const userId =
            ((nodeData.inputs?.petUserId as string) || '').trim() ||
            ((overrideConfig.petUserId as string) || '').trim() ||
            ((overrideConfig.userId as string) || '').trim()
        const userText = ((nodeData.inputs?.petInput as string) || (typeof input === 'string' ? input : '')).trim()

        if (!embeddingModelName) throw new Error('Pet node: Embedding Model is required')
        if (!userId) throw new Error('Pet node: User ID is required (set petUserId input or pass overrideConfig.petUserId)')
        if (!userText) throw new Error('Pet node: Pet Input is required')

        const appDataSource = options.appDataSource as DataSource
        const databaseEntities = options.databaseEntities as { [key: string]: any }
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
            nodeData,
            chatId,
            sseStreamer,
            isLastNode,
            options
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

        // Update pet attributes
        const attrs = this.parseJson(pet.attributes) as { [k: string]: number }
        const personalityVec = this.parseJson(pet.personalityVector) as number[]
        const growthCycle = this.parseJson(pet.growthCycle) as { cardCount: number; exp: number; level: number }

        const delta = computePersonalityDelta(parsed!.traitTags)
        const newPersonality = personalityVec.map((v, i) => Math.max(-1, Math.min(1, v + (delta[i] ?? 0) * 0.05)))

        growthCycle.cardCount = (growthCycle.cardCount || 0) + 1
        growthCycle.exp = (growthCycle.exp || 0) + 10
        growthCycle.level = deriveLevel(growthCycle.exp)

        attrs.hunger = Math.max(0, (attrs.hunger ?? 100) - 5)

        await petRepo.update(pet.id, {
            attributes: JSON.stringify(attrs),
            personalityVector: JSON.stringify(newPersonality),
            growthCycle: JSON.stringify(growthCycle)
        })

        const _stage = deriveStage(growthCycle.cardCount)
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
        nodeData: INodeData,
        chatId: string,
        sseStreamer: IServerSideEventStreamer | undefined,
        isLastNode: boolean,
        options: ICommonObject
    ) {
        const growthCycle = this.parseJson(pet.growthCycle) as { cardCount: number; exp: number; level: number }
        const cardCount = growthCycle.cardCount || 0
        const stage = deriveStage(cardCount)

        // Egg stage: no cards, no LLM
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

        // Check for action intent match
        const actionMatches = findTopMatches(queryEmbedding, actionCards, ACTION_TOPK, ACTION_THRESHOLD)
        if (actionMatches.length > 0) {
            const intent = actionMatches[0].output
            const responseText = `[${intent}]`
            return this.buildReturn(responseText, nodeData, userText, chatId, sseStreamer, isLastNode, intent)
        }

        // Babble stage: direct recall
        if (stage === 'babble') {
            const matches = findTopMatches(queryEmbedding, nonActionCards, ECHO_RECALL_TOPK)
            const resp = buildBabbleResponse(matches)
            return this.buildReturn(resp.text, nodeData, userText, chatId, sseStreamer, isLastNode)
        }

        // Echo/Talk/Mature: LLM-based response
        if (!chatModel) {
            const matches = findTopMatches(queryEmbedding, nonActionCards, ECHO_RECALL_TOPK)
            const resp = buildBabbleResponse(matches)
            return this.buildReturn(resp.text, nodeData, userText, chatId, sseStreamer, isLastNode)
        }

        const topMatches = findTopMatches(queryEmbedding, nonActionCards, CHAT_RECALL_TOPK)
        const recentVocab = await this.getRecentVocab(cardRepo, pet.id, 30)
        const systemPrompt = selectStagePrompt(stage, recentVocab, pet.personalityNarrative)
        const fewShots = buildFewShotMessages(topMatches)

        const messages: Array<{ role: string; content: string }> = [
            { role: 'system', content: systemPrompt },
            ...fewShots,
            { role: 'user', content: userText }
        ]

        const abortController = options.abortController as AbortController | undefined

        let responseText = ''
        if (isLastNode && sseStreamer) {
            for await (const chunk of await chatModel.stream(messages as any, { signal: abortController?.signal })) {
                const token = typeof chunk.content === 'string' ? chunk.content : ''
                sseStreamer.streamTokenEvent(chatId, token)
                responseText += token
            }
            sseStreamer.streamEndEvent(chatId)
            // Already streamed — pass null streamer to buildReturn to avoid double-stream
            return this.buildReturn(responseText, nodeData, userText, chatId, undefined, false)
        } else {
            const response = await chatModel.invoke(messages as any, { signal: abortController?.signal })
            responseText = typeof response.content === 'string' ? response.content : String(response.content)
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
        usedTool?: string
    ) {
        if (isLastNode && sseStreamer) {
            sseStreamer.streamTokenEvent(chatId, text)
            sseStreamer.streamEndEvent(chatId)
        }
        return {
            id: nodeData.id,
            name: this.name,
            input: { userText },
            output: { content: text, usedTool },
            state: {},
            chatHistory: [
                { role: 'user', content: userText },
                { role: 'assistant', content: text }
            ]
        }
    }
}

module.exports = { nodeClass: Pet_Agentflow }
