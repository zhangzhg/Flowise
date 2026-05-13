import { ICommonObject, IDatabaseEntity, INode, INodeData, INodeOutputsValue, INodeParams, updateFlowState } from 'flowise-components'
import {
    deriveStage,
    detectScheduleTrigger,
    detectConsolidateTrigger,
    parseTeachingCommand,
    ParsedCard,
    buildEggResponse
} from '../helpers/petUtils'
import { DataSource } from 'typeorm'

const BRANCHES = ['consolidate', 'teach', 'egg', 'babble', 'llm', 'agent'] as const
type PetBranch = (typeof BRANCHES)[number]

function resolveBranch(stage: string, triggerType: 'consolidate' | 'teach' | 'chat'): PetBranch {
    if (triggerType === 'consolidate') return 'consolidate'
    if (triggerType === 'teach') return 'teach'
    if (stage === 'egg') return 'egg'
    if (stage === 'babble') return 'babble'
    if (stage === 'mature') return 'agent'
    return 'llm'
}

class PetContext_Agentflow implements INode {
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
    outputs: INodeOutputsValue[]

    constructor() {
        this.label = 'Pet Context'
        this.name = 'petContextAgentflow'
        this.version = 1.0
        this.type = 'PetContext'
        this.category = 'Agent Flows'
        this.icon = 'Pet.svg'
        this.description = 'Loads Pet state from DB, detects trigger type, and routes to the correct downstream branch'
        this.color = '#FFD700'
        this.baseClasses = [this.type]
        this.inputs = [
            {
                label: 'User ID',
                name: 'petUserId',
                type: 'string',
                acceptVariable: true,
                description: 'User ID identifying which Pet to load. Auto-resolved from overrideConfig.petUserId.'
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
        this.outputs = [
            { label: 'Consolidate', name: 'consolidate', description: 'Background memory-consolidation trigger' },
            { label: 'Teach', name: 'teach', description: 'Teaching command detected (跟我读 / 教你做 …)' },
            { label: 'Egg 🥚', name: 'egg', description: 'Egg stage — no LLM, primitive sound only' },
            { label: 'Babble 🐣', name: 'babble', description: 'Babble stage — card recall, no LLM' },
            { label: 'LLM Chat 🧒', name: 'llm', description: 'Echo / Talk stage — LLM with few-shot & memory' },
            { label: 'Agent 🧑', name: 'agent', description: 'Mature stage — LLM + tool calling' }
        ]
    }

    async run(nodeData: INodeData, input: string | Record<string, any>, options: ICommonObject): Promise<any> {
        const overrideConfig = (options.overrideConfig ?? {}) as ICommonObject
        const appDataSource = options.appDataSource as DataSource
        const databaseEntities = options.databaseEntities as IDatabaseEntity
        const chatId = (options.chatId as string) || ''
        const state = (options.agentflowRuntime?.state as ICommonObject) ?? {}

        let userId =
            ((nodeData.inputs?.petUserId as string) || '').trim() ||
            ((overrideConfig.petUserId as string) || '').trim() ||
            ((overrideConfig.userId as string) || '').trim()

        let userText = ((nodeData.inputs?.petInput as string) || (typeof input === 'string' ? input : '')).trim()

        const scheduleTrigger = detectScheduleTrigger(userText)
        if (scheduleTrigger) {
            userText = scheduleTrigger.prompt
            if (!userId && scheduleTrigger.userId) userId = scheduleTrigger.userId
        }

        const consolidateTrigger = detectConsolidateTrigger(userText)
        if (consolidateTrigger && !userId) userId = consolidateTrigger.userId

        if (!userId) throw new Error('PetContext: User ID is required')
        if (!userText && !consolidateTrigger) throw new Error('PetContext: Pet Input is required')

        const petRepo = appDataSource.getRepository(databaseEntities['Pet'])
        const pet = await petRepo.findOne({ where: { userId } })
        if (!pet) throw new Error(`PetContext: No pet found for userId=${userId}`)

        let attrs: Record<string, any> = {}
        try {
            attrs = pet.attributes ? JSON.parse(pet.attributes) : {}
        } catch {
            attrs = {}
        }

        const cardCount: number = attrs.cardCount || 0
        const chatTurns: number = attrs.chatTurns || 0
        const stage = deriveStage(cardCount, chatTurns)
        const language: string = (pet.language as string) || 'zh'
        const personalityNarrative: string = (pet.personalityNarrative as string) || ''

        let triggerType: 'consolidate' | 'teach' | 'chat'
        let parsedTeach: ParsedCard | null = null

        if (consolidateTrigger) {
            triggerType = 'consolidate'
        } else {
            parsedTeach = parseTeachingCommand(userText)
            triggerType = parsedTeach ? 'teach' : 'chat'
        }

        const branch = resolveBranch(stage, triggerType)

        let petResponse = ''
        if (branch === 'egg') {
            petResponse = buildEggResponse(language).text
        }

        const lastChatId = attrs._lastChatId as string | undefined
        if (chatId && lastChatId !== chatId) {
            attrs._lastChatId = chatId
            petRepo.update(pet.id, { attributes: JSON.stringify(attrs) }).catch(() => {})
        }

        const newState = updateFlowState(state, [
            { key: 'petId', value: pet.id },
            { key: 'petName', value: pet.name as string },
            { key: 'userId', value: userId },
            { key: 'chatId', value: chatId },
            { key: 'stage', value: stage },
            { key: 'language', value: language },
            { key: 'userText', value: userText },
            { key: 'cardCount', value: String(cardCount) },
            { key: 'chatTurns', value: String(chatTurns) },
            { key: 'personalityNarrative', value: personalityNarrative },
            { key: 'petResponse', value: petResponse },
            { key: 'parsedTeach', value: parsedTeach ? JSON.stringify(parsedTeach) : '' },
            { key: 'branch', value: branch },
            { key: 'queryEmbedding', value: '' },
            { key: 'fewShotMatches', value: '[]' },
            { key: 'recentVocab', value: '[]' },
            { key: 'memorySection', value: '' },
            { key: 'systemPrompt', value: '' }
        ])

        const conditions = BRANCHES.map((b) => ({ output: b, isFulfilled: b === branch }))
        const outputContent = branch === 'egg' ? petResponse : userText

        return {
            id: nodeData.id,
            name: this.name,
            input: { userId, userText },
            output: { content: outputContent, conditions },
            state: newState,
            chatHistory: []
        }
    }
}

module.exports = { nodeClass: PetContext_Agentflow }
