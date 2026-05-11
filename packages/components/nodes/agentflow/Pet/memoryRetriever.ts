import { cosine } from './matcher'

export interface MemoryResult {
    id: string
    summary: string
    memoryType: string
    similarity: number
    importance: number
}

// In-memory cosine is less reliable than pgvector; use calibrated thresholds
const CERTAIN = 0.75
const PROBABLE = 0.55

/**
 * P2: Retrieve memories most similar to queryVec, split into high/mid confidence layers.
 * Uses in-memory cosine similarity (cross-DB compatible, no pgvector required).
 */
export async function retrieveMemories(params: {
    queryVec: number[]
    petId: string
    memoryRepo: any
    limit?: number
}): Promise<{ highConf: MemoryResult[]; midConf: MemoryResult[] }> {
    const { queryVec, petId, memoryRepo, limit = 6 } = params

    if (!queryVec.length) return { highConf: [], midConf: [] }

    const all: any[] = await memoryRepo.find({ where: { petId } })
    if (!all.length) return { highConf: [], midConf: [] }

    const scored: MemoryResult[] = []
    for (const m of all) {
        try {
            const vec = JSON.parse(m.embedding) as number[]
            if (!vec.length) continue
            // Weight by importance so frequently reinforced memories rank higher
            const rawSim = cosine(queryVec, vec)
            const weightedSim = rawSim * Math.max(0.5, Math.min(1.5, m.importance))
            scored.push({
                id: m.id,
                summary: m.summary,
                memoryType: m.memoryType,
                similarity: weightedSim,
                importance: m.importance
            })
        } catch {
            /* skip malformed rows */
        }
    }

    scored.sort((a, b) => b.similarity - a.similarity)
    const top = scored.slice(0, limit)

    // Async update accessCount + lastAccessedAt (fire-and-forget, P3 hot path)
    if (top.length) {
        const ids = top.map((x) => x.id)
        import('typeorm')
            .then(({ In }) => {
                memoryRepo.increment({ id: In(ids) }, 'accessCount', 1).catch(() => {})
                memoryRepo.update({ id: In(ids) }, { lastAccessedAt: new Date() }).catch(() => {})
            })
            .catch(() => {})
    }

    return {
        highConf: top.filter((x) => x.similarity >= CERTAIN),
        midConf: top.filter((x) => x.similarity >= PROBABLE && x.similarity < CERTAIN)
    }
}

/** Build the memory section text for injection into system prompt. */
export function buildMemorySection(highConf: MemoryResult[], midConf: MemoryResult[]): string {
    if (!highConf.length && !midConf.length) return ''
    const lines: string[] = []
    if (highConf.length) {
        lines.push('\n【你确定记得的事】')
        highConf.forEach((m) => lines.push(`• ${m.summary}`))
    }
    if (midConf.length) {
        lines.push('\n【你隐约记得的事】（可能不准确，不必主动提及）')
        midConf.forEach((m) => lines.push(`• ${m.summary}`))
    }
    return lines.join('\n')
}
