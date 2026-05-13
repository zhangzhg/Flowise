import { ICommonObject, IDatabaseEntity, INode, INodeData, INodeOptionsValue, INodeParams, updateFlowState } from 'flowise-components'
import {
    findTopMatches,
    StoredCard,
    buildBabbleResponse,
    ACTION_TOPK,
    ACTION_MATCH_THRESHOLD,
    ECHO_RECALL_TOPK,
    CHAT_RECALL_TOPK
} from '../helpers/petUtils'
import { Embeddings } from '@langchain/core/embeddings'
import { DataSource } from 'typeorm'

class PetCardRecaller_Agentflow implements INode {
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
        this.label = 'Pet Card Recaller'
        this.name = 'petCardRecallerAgentflow'
        this.version = 1.0
        this.type = 'PetCardRecaller'
        this.category = 'Pet'
        this.icon = 'Pet.svg'
        this.description =
            'Embeds user input and recalls matching Cards (vocab/phrase/action). ' +
            'Babble branch: sets petResponse. LLM/Agent branches: sets queryEmbedding + fewShotMatches + recentVocab.'
        this.color = '#FFD700'
        this.baseClasses = [this.type]
        this.inputs = [
            {
                label: 'Embedding Model',
                name: 'petEmbeddingModel',
                type: 'asyncOptions',
                loadMethod: 'listEmbeddings',
                loadConfig: true
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
        const state = (options.agentflowRuntime?.state as ICommonObject) ?? {}

        const petId = state.petId as string
        const userText = state.userText as string
        const stage = state.stage as string
        const language = (state.language as string) || 'zh'

        if (!petId) throw new Error('PetCardRecaller: petId not found in flowState — connect PetContext upstream')
        if (!userText) throw new Error('PetCardRecaller: userText not found in flowState')

        const embeddingModelName = nodeData.inputs?.petEmbeddingModel as string
        const embeddingModelConfig = (nodeData.inputs?.petEmbeddingModelConfig as ICommonObject) ?? {}
        if (!embeddingModelName) throw new Error('PetCardRecaller: Embedding Model is required')

        const embeddings = await this.instantiateEmbeddings(embeddingModelName, embeddingModelConfig, nodeData, options)
        const [queryVec] = await embeddings.embedDocuments([userText])

        const cardRepo = appDataSource.getRepository(databaseEntities['Card'])
        const allCards = (await cardRepo.find({ where: { petId } })) as any[] as StoredCard[]
        const nonActionCards = allCards.filter((c) => c.cardType !== 'action')
        const actionCards = allCards.filter((c) => c.cardType === 'action')

        const actionMatches = findTopMatches(queryVec, actionCards, ACTION_TOPK, ACTION_MATCH_THRESHOLD, userText)
        if (actionMatches.length > 0) {
            const newState = updateFlowState(state, [
                { key: 'queryEmbedding', value: JSON.stringify(queryVec) },
                { key: 'petResponse', value: '好的！' },
                { key: 'actionMatchName', value: actionMatches[0].output },
                { key: 'fewShotMatches', value: '[]' },
                { key: 'recentVocab', value: '[]' }
            ])
            return {
                id: nodeData.id,
                name: this.name,
                input: { userText },
                output: { content: '好的！' },
                state: newState,
                chatHistory: []
            }
        }

        const topK = stage === 'babble' || stage === 'echo' ? ECHO_RECALL_TOPK : CHAT_RECALL_TOPK
        const topMatches = findTopMatches(queryVec, nonActionCards, topK, 0, userText)

        let petResponse = state.petResponse as string

        if (stage === 'babble') {
            petResponse = buildBabbleResponse(topMatches, language).text
        }

        const recentCards = await cardRepo.find({ where: { petId }, order: { createdDate: 'DESC' }, take: 30 })
        const recentVocab: string[] = (recentCards as any[]).map((c) => c.input)

        const newState = updateFlowState(state, [
            { key: 'queryEmbedding', value: JSON.stringify(queryVec) },
            { key: 'petResponse', value: petResponse },
            { key: 'fewShotMatches', value: JSON.stringify(topMatches.map((m) => ({ input: m.input, output: m.output }))) },
            { key: 'recentVocab', value: JSON.stringify(recentVocab) },
            { key: 'actionMatchName', value: '' }
        ])

        const outputContent = stage === 'babble' ? petResponse : userText

        return {
            id: nodeData.id,
            name: this.name,
            input: { userText },
            output: { content: outputContent },
            state: newState,
            chatHistory: []
        }
    }

    private async instantiateEmbeddings(
        name: string,
        config: ICommonObject,
        nodeData: INodeData,
        options: ICommonObject
    ): Promise<Embeddings> {
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

module.exports = { nodeClass: PetCardRecaller_Agentflow }
