import { DataSource } from 'typeorm'
import logger from '../../logger'
import { Pet } from '../../../database/entities/Pet'
import { Tool } from '../../../database/entities/Tool'
import { IntentSkillBinding } from '../../../database/entities/IntentSkillBinding'

const PET_AUTO_BIND_THRESHOLD = 0.7
const BINDER_CRON_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

function cosineSim(a: number[], b: number[]): number {
    const len = Math.min(a.length, b.length)
    let dot = 0,
        magA = 0,
        magB = 0
    for (let i = 0; i < len; i++) {
        dot += a[i] * b[i]
        magA += a[i] * a[i]
        magB += b[i] * b[i]
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB)
    return denom === 0 ? 0 : dot / denom
}

function parseJsonSafe(val: string | null | undefined): any {
    if (!val) return null
    try {
        return JSON.parse(val)
    } catch {
        return null
    }
}

export class SkillAutoBinder {
    private static instance: SkillAutoBinder
    private timer: NodeJS.Timeout | null = null
    private dataSource: DataSource | null = null

    private constructor() {}

    public static getInstance(): SkillAutoBinder {
        if (!SkillAutoBinder.instance) {
            SkillAutoBinder.instance = new SkillAutoBinder()
        }
        return SkillAutoBinder.instance
    }

    public init(dataSource: DataSource): void {
        this.dataSource = dataSource
        // Run once immediately on startup, then hourly
        this.run().catch((err) => logger.error('[SkillAutoBinder] Initial run error:', err))
        this.timer = setInterval(() => {
            this.run().catch((err) => logger.error('[SkillAutoBinder] Scheduled run error:', err))
        }, BINDER_CRON_INTERVAL_MS)
        logger.info('[SkillAutoBinder] Initialized — runs every hour')
    }

    public destroy(): void {
        if (this.timer) {
            clearInterval(this.timer)
            this.timer = null
        }
    }

    private async run(): Promise<void> {
        if (!this.dataSource) return

        const petRepo = this.dataSource.getRepository(Pet)
        const toolRepo = this.dataSource.getRepository(Tool)
        const bindingRepo = this.dataSource.getRepository(IntentSkillBinding)

        const pets: any[] = await petRepo.find()
        if (!pets.length) return

        // Load all tools that have a Phase 3 metadata comment in their func:
        // "// @openclaw-meta:{...}"
        const tools: any[] = await toolRepo.find()
        const skillTools = tools.filter((t) => typeof t.func === 'string' && t.func.startsWith('// @openclaw-meta:'))

        if (!skillTools.length) return

        let totalBound = 0

        for (const pet of pets) {
            const growthCycle = parseJsonSafe(pet.growthCycle) ?? {}
            const petLevel: number = growthCycle.level ?? 0
            const petVector: number[] | null = parseJsonSafe(pet.personalityVector)
            if (!petVector || !petVector.length) continue

            for (const tool of skillTools) {
                const metaLine = (tool.func as string).split('\n')[0]
                const metaJson = metaLine.replace('// @openclaw-meta:', '').trim()
                const meta = parseJsonSafe(metaJson) ?? {}
                const profile: number[] = meta.personalityProfile
                const minLevel: number = meta.minLevel ?? 0
                const boundIntents: string[] = meta.boundIntents ?? []

                if (petLevel < minLevel) continue
                if (!boundIntents.length) continue

                const score = cosineSim(petVector, profile)
                if (score <= PET_AUTO_BIND_THRESHOLD) continue

                const primaryIntent = boundIntents[0]

                // Check if already bound for this pet+intent
                const existing = await bindingRepo.findOne({ where: { petId: pet.id, intent: primaryIntent } })
                if (existing) continue

                // Create auto binding
                const binding = bindingRepo.create({
                    petId: pet.id,
                    intent: primaryIntent,
                    skillToolId: tool.id,
                    source: 'auto' as const,
                    autoBindScore: score,
                    priority: 0
                })
                await bindingRepo.save(binding)
                totalBound++
                logger.info(
                    `[SkillAutoBinder] Auto-bound skill "${tool.name}" → pet ${pet.id} intent="${primaryIntent}" score=${score.toFixed(3)}`
                )
            }
        }

        if (totalBound > 0) {
            logger.info(`[SkillAutoBinder] Run complete — ${totalBound} new binding(s) created`)
        }
    }
}

export default SkillAutoBinder.getInstance()
