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
import { deriveStage, applyTurnDrift } from '../helpers/petUtils'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { DataSource } from 'typeorm'

class PetStateUpdater_Agentflow implements INode {
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
        this.label = 'Pet State Updater'
        this.name = 'petStateUpdaterAgentflow'
        this.version = 1.0
        this.type = 'PetStateUpdater'
        this.category = 'Agent Flows'
        this.icon = 'Pet.svg'
        this.description =
            'Terminal node for LLM/Agent branches. Saves PetChatMessages, triggers personality drift ' +
            'and optional memory consolidation (all fire-and-forget), then streams the reply.'
        this.color = '#FFD700'
        this.baseClasses = [this.type]
        this.inputs = [
            {
                label: 'Reply',
                name: 'petStateUpdaterReply',
                type: 'string',
                acceptVariable: true,
                rows: 2,
                description: 'Connect to the LLM or Agent node output that produced the pet reply'
            },
            {
                label: 'Chat Model (optional)',
                name: 'petChatModel',
                type: 'asyncOptions',
                loadMethod: 'listChatModels',
                loadConfig: true,
                optional: true,
                description: 'Required for personality drift. Connect the same model used in the LLM/Agent node.'
            }
        ]
    }

    //@ts-ignore
    loadMethods = {
        async listChatModels(_: INodeData, options: ICommonObject): Promise<INodeOptionsValue[]> {
            const componentNodes = options.componentNodes as { [key: string]: INode }
            return Object.values(componentNodes)
                .filter((n) => n.category === 'Chat Models' && !n.tags?.includes('LlamaIndex'))
                .map((n) => ({ label: n.label, name: n.name, imageSrc: n.icon }))
        }
    }

    async run(nodeData: INodeData, _input: string | Record<string, any>, options: ICommonObject): Promise<any> {
        const appDataSource = options.appDataSource as DataSource
        const databaseEntities = options.databaseEntities as IDatabaseEntity
        const isLastNode = options.isLastNode as boolean
        const sseStreamer = options.sseStreamer as IServerSideEventStreamer | undefined
        const state = (options.agentflowRuntime?.state as ICommonObject) ?? {}

        const replyText = ((nodeData.inputs?.petStateUpdaterReply as string) || '').trim()

        const petId = state.petId as string
        const userId = state.userId as string
        const userText = state.userText as string
        const chatId = (state.chatId as string) || (options.chatId as string) || ''
        const cardCount = parseInt(state.cardCount as string) || 0
        const chatTurns = parseInt(state.chatTurns as string) || 0
        const stage = deriveStage(cardCount, chatTurns)

        if (!petId) throw new Error('PetStateUpdater: petId not found in flowState')

        const messageRepo = databaseEntities['PetChatMessage'] ? appDataSource.getRepository(databaseEntities['PetChatMessage']) : null

        if (messageRepo && chatId && userText) {
            Promise.all([
                messageRepo.save(messageRepo.create({ petId, chatId, role: 'user', content: userText, consolidated: false })),
                messageRepo.save(messageRepo.create({ petId, chatId, role: 'assistant', content: replyText, consolidated: false }))
            ]).catch(() => {})
        }

        const petRepo = appDataSource.getRepository(databaseEntities['Pet'])
        let attrs: Record<string, any> = {}
        try {
            const pet = await petRepo.findOne({ where: { id: petId } })
            if (pet) attrs = pet.attributes ? JSON.parse(pet.attributes as string) : {}
        } catch {
            /* ignore */
        }

        petRepo
            .update(petId, {
                attributes: JSON.stringify({
                    ...attrs,
                    chatTurns: chatTurns + 1,
                    hunger: Math.max(0, (attrs.hunger ?? 100) - 1)
                })
            })
            .catch(() => {})

        const chatModelName = nodeData.inputs?.petChatModel as string | undefined
        if (chatModelName && userText && replyText) {
            this.fireDriftAsync(
                chatModelName,
                nodeData,
                options,
                userText,
                replyText,
                stage,
                petId,
                appDataSource,
                databaseEntities,
                chatId
            )
        }

        if (messageRepo) {
            this.maybeConsolidate(petId, petRepo, messageRepo, databaseEntities, appDataSource, state).catch(() => {})
        }

        if (isLastNode && sseStreamer) {
            sseStreamer.streamTokenEvent(chatId, replyText)
            sseStreamer.streamEndEvent(chatId)
        }

        const newState = updateFlowState(state, [{ key: 'petResponse', value: replyText }])

        return {
            id: nodeData.id,
            name: this.name,
            input: { userText, replyText },
            output: { content: replyText },
            state: newState,
            chatHistory: [
                { role: 'user', content: userText },
                { role: 'assistant', content: replyText }
            ]
        }
    }

    private fireDriftAsync(
        chatModelName: string,
        nodeData: INodeData,
        options: ICommonObject,
        userText: string,
        petReply: string,
        stage: any,
        petId: string,
        appDataSource: DataSource,
        databaseEntities: IDatabaseEntity,
        chatId: string
    ): void {
        const eventRepo = databaseEntities['PetPersonalityEvent']
            ? appDataSource.getRepository(databaseEntities['PetPersonalityEvent'])
            : null
        if (!eventRepo) return

        const chatModelConfig = (nodeData.inputs?.petChatModelConfig as ICommonObject) ?? {}
        const filePath = options.componentNodes[chatModelName].filePath as string
        const petRepo = appDataSource.getRepository(databaseEntities['Pet'])

        import(filePath)
            .then(async (mod) => {
                const inst = new mod.nodeClass()
                const enriched = {
                    ...nodeData,
                    credential: chatModelConfig?.['FLOWISE_CREDENTIAL_ID'],
                    inputs: { ...nodeData.inputs, ...chatModelConfig }
                }
                const chatModel = (await inst.init(enriched, '', options)) as BaseChatModel
                const pet = await petRepo.findOne({ where: { id: petId } })
                if (!pet) return
                return applyTurnDrift({ userText, petReply, stage, chatModel, pet, petRepo, eventRepo, chatId })
            })
            .catch(() => {})
    }

    private async maybeConsolidate(
        petId: string,
        petRepo: any,
        messageRepo: any,
        databaseEntities: IDatabaseEntity,
        appDataSource: DataSource,
        state: ICommonObject
    ): Promise<void> {
        const THRESHOLD = 8
        try {
            const count = await messageRepo.count({ where: { petId, consolidated: false } })
            if (count < THRESHOLD) return

            const memoryRepo = databaseEntities['PetMemory'] ? appDataSource.getRepository(databaseEntities['PetMemory']) : null
            if (!memoryRepo) return
        } catch {
            /* ignore */
        }
    }
}

module.exports = { nodeClass: PetStateUpdater_Agentflow }
