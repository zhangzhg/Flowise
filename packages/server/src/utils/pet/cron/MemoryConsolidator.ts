import { DataSource, IsNull, LessThan, Not } from 'typeorm'
import { v4 as uuidv4 } from 'uuid'
import { ChatFlow } from '../../../database/entities/ChatFlow'
import { Pet } from '../../../database/entities/Pet'
import { PetChatMessage } from '../../../database/entities/PetChatMessage'
import { PetMemory } from '../../../database/entities/PetMemory'
import { Organization } from '../../../enterprise/database/entities/organization.entity'
import { Workspace } from '../../../enterprise/database/entities/workspace.entity'
import { executeAgentFlow } from '../../buildAgentflow'
import { getRunningExpressApp } from '../../getRunningExpressApp'
import logger from '../../logger'

const CRON_INTERVAL_MS = 60 * 60 * 1000 // 1 hour
const CONSOLIDATION_THRESHOLD = 8 // min unconsolidated messages before triggering
const DECAY_FACTOR = 0.5
const DECAY_DAYS = 30
const MIN_IMPORTANCE = 0.1 // floor — never decay below this

export class MemoryConsolidator {
    private static instance: MemoryConsolidator
    private timer: NodeJS.Timeout | null = null
    private dataSource: DataSource | null = null

    private constructor() {}

    public static getInstance(): MemoryConsolidator {
        if (!MemoryConsolidator.instance) {
            MemoryConsolidator.instance = new MemoryConsolidator()
        }
        return MemoryConsolidator.instance
    }

    public init(dataSource: DataSource): void {
        this.dataSource = dataSource
        this.run().catch((err) => logger.error('[MemoryConsolidator] Initial run error:', err))
        this.timer = setInterval(() => {
            this.run().catch((err) => logger.error('[MemoryConsolidator] Scheduled run error:', err))
        }, CRON_INTERVAL_MS)
        logger.info('[MemoryConsolidator] Initialized — runs every hour')
    }

    public destroy(): void {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = null
        }
    }

    private async run(): Promise<void> {
        await Promise.all([this.decayStaleMemories(), this.triggerConsolidations()])
    }

    /** Decay importance of memories not accessed in DECAY_DAYS days. No LLM needed. */
    private async decayStaleMemories(): Promise<void> {
        if (!this.dataSource) return
        try {
            const memoryRepo = this.dataSource.getRepository(PetMemory)
            const cutoff = new Date(Date.now() - DECAY_DAYS * 24 * 60 * 60 * 1000)
            const stale = await memoryRepo.find({ where: { lastAccessedAt: LessThan(cutoff) } })
            if (!stale.length) return

            const toSave: PetMemory[] = []
            for (const m of stale) {
                if (m.importance <= MIN_IMPORTANCE) continue
                m.importance = Math.max(MIN_IMPORTANCE, m.importance * DECAY_FACTOR)
                toSave.push(m)
            }

            if (toSave.length) {
                await memoryRepo.save(toSave)
                logger.info(`[MemoryConsolidator] Decayed importance for ${toSave.length} stale memory/memories`)
            }
        } catch (err) {
            logger.error('[MemoryConsolidator] decayStaleMemories error:', err)
        }
    }

    /** Find pets with enough unconsolidated messages and fire a consolidation trigger for each. */
    private async triggerConsolidations(): Promise<void> {
        if (!this.dataSource) return
        try {
            const petRepo = this.dataSource.getRepository(Pet)
            const messageRepo = this.dataSource.getRepository(PetChatMessage)

            const pets = await petRepo.find({ where: { petFlowId: Not(IsNull()) } })
            if (!pets.length) return

            for (const pet of pets) {
                try {
                    const count = await messageRepo.count({ where: { petId: pet.id, consolidated: false } })
                    if (count < CONSOLIDATION_THRESHOLD) continue
                    await this.fireConsolidation(pet)
                } catch (err) {
                    logger.error(`[MemoryConsolidator] Error processing pet ${pet.id}:`, err)
                }
            }
        } catch (err) {
            logger.error('[MemoryConsolidator] triggerConsolidations error:', err)
        }
    }

    private async fireConsolidation(pet: Pet): Promise<void> {
        const appServer = getRunningExpressApp()
        const { AppDataSource, nodesPool, telemetry, usageCacheManager, cachePool, sseStreamer, identityManager } = appServer

        const chatflow = await AppDataSource.getRepository(ChatFlow).findOneBy({ id: pet.petFlowId! })
        if (!chatflow) {
            logger.warn(`[MemoryConsolidator] ChatFlow ${pet.petFlowId} not found for pet ${pet.id}`)
            return
        }

        const workspace = await AppDataSource.getRepository(Workspace).findOneBy({ id: pet.workspaceId })
        if (!workspace) {
            logger.warn(`[MemoryConsolidator] Workspace ${pet.workspaceId} not found for pet ${pet.id}`)
            return
        }

        const org = await AppDataSource.getRepository(Organization).findOneBy({ id: workspace.organizationId })
        if (!org) {
            logger.warn(`[MemoryConsolidator] Organization not found for workspace ${pet.workspaceId}`)
            return
        }

        const subscriptionId = org.subscriptionId as string
        const productId = await identityManager.getProductIdFromSubscription(subscriptionId)
        const chatId = uuidv4()
        const baseURL = process.env.FLOWISE_URL ?? 'http://localhost:3000'

        logger.info(`[MemoryConsolidator] Triggering consolidation for pet ${pet.id} (${pet.name})`)

        await executeAgentFlow({
            componentNodes: nodesPool.componentNodes,
            incomingInput: { question: JSON.stringify({ __consolidate__: true, userId: pet.userId }) },
            chatflow,
            chatId,
            appDataSource: AppDataSource,
            telemetry,
            usageCacheManager,
            cachePool,
            sseStreamer,
            baseURL,
            isInternal: true,
            signal: new AbortController(),
            orgId: org.id,
            workspaceId: workspace.id,
            subscriptionId,
            productId
        })
    }
}

export default MemoryConsolidator.getInstance()
