import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'
import { DataSource } from 'typeorm'

class SkillRouter_Agentflow implements INode {
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
        this.label = 'Skill Router'
        this.name = 'skillRouterAgentflow'
        this.version = 1.0
        this.type = 'SkillRouter'
        this.category = 'Agent Flows'
        this.icon = 'skillrouter.svg'
        this.description = 'Routes a pet intent to the matching bound skill tool, or null if none matched'
        this.color = '#A78BFA'
        this.baseClasses = [this.type]
        this.inputs = [
            {
                label: 'Pet ID',
                name: 'petId',
                type: 'string',
                acceptVariable: true,
                description: 'ID of the pet whose skill bindings to query'
            },
            {
                label: 'Intent',
                name: 'intent',
                type: 'string',
                acceptVariable: true,
                description: 'Intent label extracted from the pet output (e.g. "weather", "music")'
            }
        ]
    }

    async run(nodeData: INodeData, _input: string | Record<string, any>, options: ICommonObject): Promise<any> {
        const petId = ((nodeData.inputs?.petId as string) || '').trim()
        const intent = ((nodeData.inputs?.intent as string) || '').trim()

        if (!petId) throw new Error('SkillRouter: Pet ID is required')
        if (!intent) {
            return { id: nodeData.id, name: this.name, input: { petId, intent }, output: { tool: null }, state: {}, chatHistory: [] }
        }

        const appDataSource = options.appDataSource as DataSource
        const databaseEntities = options.databaseEntities as { [key: string]: any }

        const bindingRepo = appDataSource.getRepository(databaseEntities['IntentSkillBinding'])
        const toolRepo = appDataSource.getRepository(databaseEntities['Tool'])

        // Find the best binding for this pet+intent (highest priority first)
        const binding = await bindingRepo.findOne({
            where: { petId, intent },
            order: { priority: 'DESC' }
        })

        if (!binding) {
            return { id: nodeData.id, name: this.name, input: { petId, intent }, output: { tool: null }, state: {}, chatHistory: [] }
        }

        const tool = await toolRepo.findOne({ where: { id: binding.skillToolId } })

        return {
            id: nodeData.id,
            name: this.name,
            input: { petId, intent },
            output: { tool: tool ?? null, bindingId: binding.id, source: binding.source },
            state: {},
            chatHistory: []
        }
    }
}

module.exports = { nodeClass: SkillRouter_Agentflow }
