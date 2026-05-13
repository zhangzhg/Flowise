import {
    ICommonObject,
    IDatabaseEntity,
    INode,
    INodeData,
    INodeOptionsValue,
    INodeParams,
    IServerSideEventStreamer,
    updateFlowState
} from 'flowise-components'
import { Embeddings } from '@langchain/core/embeddings'
import { DataSource } from 'typeorm'

class PetCardSaver_Agentflow implements INode {
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
        this.label = 'Pet Card Saver'
        this.name = 'petCardSaverAgentflow'
        this.version = 1.0
        this.type = 'PetCardSaver'
        this.category = 'Pet'
        this.icon = 'Pet.svg'
        this.description =
            'Teach branch terminal: saves the parsedTeach card directly to the database ' +
            'and returns a confirmation message. Optionally embeds the card input for better recall.'
        this.color = '#FFD700'
        this.baseClasses = [this.type]
        this.inputs = [
            {
                label: 'Embedding Model',
                name: 'petCardEmbeddingModel',
                type: 'asyncOptions',
                loadMethod: 'listEmbeddings',
                loadConfig: true,
                optional: true,
                description: 'Recommended — generates a vector for the card so PetCardRecaller can match it by similarity.'
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
        }
    }

    async run(nodeData: INodeData, _input: string | Record<string, any>, options: ICommonObject): Promise<any> {
        const appDataSource = options.appDataSource as DataSource
        const databaseEntities = options.databaseEntities as IDatabaseEntity
        const isLastNode = options.isLastNode as boolean
        const sseStreamer = options.sseStreamer as IServerSideEventStreamer | undefined
        const state = (options.agentflowRuntime?.state as ICommonObject) ?? {}

        const petId = state.petId as string
        const language = (state.language as string) || 'zh'
        const parsedTeachRaw = (state.parsedTeach as string) || ''
        const chatId = (state.chatId as string) || (options.chatId as string) || ''
        const userText = (state.userText as string) || ''

        const reply = (msg: string) => {
            if (isLastNode && sseStreamer) {
                sseStreamer.streamTokenEvent(chatId, msg)
                sseStreamer.streamEndEvent(chatId)
            }
            return {
                id: nodeData.id,
                name: this.name,
                input: {},
                output: { content: msg },
                state: updateFlowState(state, [{ key: 'petResponse', value: msg }]),
                chatHistory: [
                    { role: 'user', content: userText },
                    { role: 'assistant', content: msg }
                ]
            }
        }

        if (!petId) {
            return reply(language === 'zh' ? '学习失败：未找到宠物信息' : 'Learning failed: pet not found')
        }

        let parsed: { cardType: string; input: string; output: string; traitTags?: string[] } | null = null
        try {
            parsed = parsedTeachRaw ? JSON.parse(parsedTeachRaw) : null
        } catch {
            parsed = null
        }

        if (!parsed || !parsed.input || !parsed.output) {
            return reply(language === 'zh' ? '学习失败，请重试' : 'Learning failed, please retry')
        }

        // Generate embedding for the card input
        let embeddingJson = '[]'
        const embeddingModelName = nodeData.inputs?.petCardEmbeddingModel as string | undefined
        if (embeddingModelName) {
            try {
                const embeddings = await this.instantiateEmbeddings(embeddingModelName, nodeData, options)
                const [vec] = await embeddings.embedDocuments([parsed.input])
                embeddingJson = JSON.stringify(vec)
            } catch {
                // Non-fatal: fall back to empty embedding (text overlap used for recall)
            }
        }

        const cardRepo = appDataSource.getRepository(databaseEntities['Card'])
        const petRepo = appDataSource.getRepository(databaseEntities['Pet'])

        try {
            const card = cardRepo.create({
                petId,
                cardType: parsed.cardType || 'vocab',
                input: parsed.input,
                output: parsed.output,
                traitTags: JSON.stringify(parsed.traitTags || []),
                embedding: embeddingJson,
                source: 'user'
            })
            await cardRepo.save(card)
        } catch {
            return reply(language === 'zh' ? '学习遇到问题，请稍后重试' : 'Learning failed, please try later')
        }

        // Increment cardCount (fire-and-forget)
        petRepo
            .findOne({ where: { id: petId } })
            .then((pet) => {
                if (!pet) return
                let attrs: Record<string, any> = {}
                try {
                    attrs = pet.attributes ? JSON.parse(pet.attributes as string) : {}
                } catch {
                    /* ignore */
                }
                attrs.cardCount = (attrs.cardCount || 0) + 1
                return petRepo.update(petId, { attributes: JSON.stringify(attrs) })
            })
            .catch(() => {})

        const msg = language === 'zh' ? `好的，我记住了！学会了"${parsed.input}"` : `Got it! I learned "${parsed.input}"`

        return reply(msg)
    }

    private async instantiateEmbeddings(name: string, nodeData: INodeData, options: ICommonObject): Promise<Embeddings> {
        const config = (nodeData.inputs?.petCardEmbeddingModelConfig as ICommonObject) ?? {}
        const filePath = options.componentNodes[name].filePath as string
        const mod = await import(filePath)
        const inst = new mod.nodeClass()
        const enriched = {
            ...nodeData,
            credential: config?.['FLOWISE_CREDENTIAL_ID'],
            inputs: { ...nodeData.inputs, ...config }
        }
        return (await inst.init(enriched, '', options)) as Embeddings
    }
}

module.exports = { nodeClass: PetCardSaver_Agentflow }
