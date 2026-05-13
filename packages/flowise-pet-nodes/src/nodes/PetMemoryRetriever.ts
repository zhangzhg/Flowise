import { ICommonObject, IDatabaseEntity, INode, INodeData, INodeParams, updateFlowState } from 'flowise-components'
import { deriveStage, retrieveMemories, buildMemorySection, buildSystemPromptWithFewShot, CardMatch } from '../helpers/petUtils'
import { DataSource } from 'typeorm'

class PetMemoryRetriever_Agentflow implements INode {
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
        this.label = 'Pet Memory Retriever'
        this.name = 'petMemoryRetrieverAgentflow'
        this.version = 1.0
        this.type = 'PetMemoryRetriever'
        this.category = 'Pet'
        this.icon = 'Pet.svg'
        this.description =
            'Retrieves relevant PetMemory records via cosine similarity, then builds the complete ' +
            'system prompt (stage + memory + few-shot examples) for the downstream LLM / Agent node.'
        this.color = '#FFD700'
        this.baseClasses = [this.type]
        this.inputs = []
    }

    async run(nodeData: INodeData, _input: string | Record<string, any>, options: ICommonObject): Promise<any> {
        const appDataSource = options.appDataSource as DataSource
        const databaseEntities = options.databaseEntities as IDatabaseEntity
        const state = (options.agentflowRuntime?.state as ICommonObject) ?? {}

        const petId = state.petId as string
        const userText = state.userText as string
        const cardCount = parseInt(state.cardCount as string) || 0
        const chatTurns = parseInt(state.chatTurns as string) || 0
        const personalityNarrative = (state.personalityNarrative as string) || undefined

        if (!petId) throw new Error('PetMemoryRetriever: petId not found in flowState')
        if (!userText) throw new Error('PetMemoryRetriever: userText not found in flowState')

        let queryVec: number[] = []
        try {
            const raw = state.queryEmbedding as string
            if (raw) queryVec = JSON.parse(raw) as number[]
        } catch {
            /* ignore malformed */
        }

        let memorySection = ''
        const petStage = deriveStage(cardCount, chatTurns)

        if (queryVec.length && (petStage === 'talk' || petStage === 'mature')) {
            const memoryRepo = databaseEntities['PetMemory'] ? appDataSource.getRepository(databaseEntities['PetMemory']) : null

            if (memoryRepo) {
                const { highConf, midConf } = await retrieveMemories({ queryVec, petId, memoryRepo })
                memorySection = buildMemorySection(highConf, midConf)
            }
        }

        let fewShotMatches: CardMatch[] = []
        try {
            const raw = state.fewShotMatches as string
            if (raw) fewShotMatches = JSON.parse(raw) as CardMatch[]
        } catch {
            /* ignore */
        }

        let recentVocab: string[] = []
        try {
            const raw = state.recentVocab as string
            if (raw) recentVocab = JSON.parse(raw) as string[]
        } catch {
            /* ignore */
        }

        const systemPrompt = buildSystemPromptWithFewShot(petStage, recentVocab, personalityNarrative, memorySection, fewShotMatches)

        const newState = updateFlowState(state, [
            { key: 'systemPrompt', value: systemPrompt },
            { key: 'memorySection', value: memorySection }
        ])

        return {
            id: nodeData.id,
            name: this.name,
            input: { petId, userText },
            output: { content: systemPrompt },
            state: newState,
            chatHistory: []
        }
    }
}

module.exports = { nodeClass: PetMemoryRetriever_Agentflow }
