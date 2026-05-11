import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { Embeddings } from '@langchain/core/embeddings'
import { cosine } from './matcher'

// Minimum unconsolidated messages before extraction runs
const CONSOLIDATION_THRESHOLD = 8
// Max messages to read per consolidation batch
const CONSOLIDATION_BATCH = 20
// Cosine similarity above which two memories are considered duplicates (P3)
const DEDUP_THRESHOLD = 0.95
// Importance multiplier applied to memories older than DECAY_DAYS (P3/P4)
const DECAY_FACTOR = 0.5
const DECAY_DAYS = 30

interface ExtractedMemories {
    episodes: string[]
    traits: string[]
    petMoments: string[]
}

function parseExtracted(text: string): ExtractedMemories {
    try {
        const m = text.match(/\{[\s\S]*\}/)
        if (!m) return { episodes: [], traits: [], petMoments: [] }
        const obj = JSON.parse(m[0])
        return {
            episodes: Array.isArray(obj.episodes) ? obj.episodes.filter(Boolean) : [],
            traits: Array.isArray(obj.traits) ? obj.traits.filter(Boolean) : [],
            petMoments: Array.isArray(obj.petMoments) ? obj.petMoments.filter(Boolean) : []
        }
    } catch {
        return { episodes: [], traits: [], petMoments: [] }
    }
}

/**
 * P1/P3: Consolidate unconsolidated chat messages into PetMemory entries.
 * - Calls LLM to extract episodes/traits/petMoments from recent messages.
 * - Embeds each summary and deduplicates against existing memories (P3).
 * - Marks processed messages as consolidated.
 */
export async function consolidateMemories(params: {
    petId: string
    petName: string
    chatModel: BaseChatModel
    embeddings: Embeddings
    messageRepo: any
    memoryRepo: any
}): Promise<number> {
    const { petId, petName, chatModel, embeddings, messageRepo, memoryRepo } = params

    const messages = await messageRepo.find({
        where: { petId, consolidated: false },
        order: { createdAt: 'ASC' },
        take: CONSOLIDATION_BATCH
    })

    if (messages.length < CONSOLIDATION_THRESHOLD) return 0

    // Build conversation text for LLM
    const formatted = messages.map((m: any) => `${m.role === 'user' ? '用户' : '宠物'}: ${m.content}`).join('\n')

    const prompt =
        `以下是AI宠物「${petName}」与用户的对话片段：\n\n${formatted}\n\n` +
        `请提取以下信息，直接输出纯 JSON（每项最多3条，每条不超过30字，无内容则留空数组）：\n` +
        `{"episodes":[],"traits":[],"petMoments":[]}`

    let extracted: ExtractedMemories
    try {
        const resp = await chatModel.invoke([{ role: 'user', content: prompt }] as any)
        const text = typeof resp.content === 'string' ? resp.content : String(resp.content)
        extracted = parseExtracted(text)
    } catch {
        extracted = { episodes: [], traits: [], petMoments: [] }
    }

    const items: Array<{ memoryType: string; summary: string }> = [
        ...extracted.episodes.map((s) => ({ memoryType: 'episode', summary: s })),
        ...extracted.traits.map((s) => ({ memoryType: 'trait', summary: s })),
        ...extracted.petMoments.map((s) => ({ memoryType: 'preference', summary: s }))
    ].filter((x) => x.summary?.trim().length > 0)

    // Load existing memories for P3 deduplication
    const existing: any[] = await memoryRepo.find({ where: { petId } })
    const existingVecs = existing.map((m: any) => {
        try {
            return { id: m.id, vec: JSON.parse(m.embedding) as number[] }
        } catch {
            return { id: m.id, vec: [] as number[] }
        }
    })

    let saved = 0
    if (items.length > 0) {
        let newEmbeddings: number[][]
        try {
            newEmbeddings = await embeddings.embedDocuments(items.map((x) => x.summary))
        } catch {
            newEmbeddings = items.map(() => [])
        }

        for (let i = 0; i < items.length; i++) {
            const vec = newEmbeddings[i]
            if (!vec.length) continue

            // P3: skip near-duplicates
            const isDup = existingVecs.some((e) => e.vec.length > 0 && cosine(vec, e.vec) >= DEDUP_THRESHOLD)
            if (isDup) continue

            await memoryRepo.save(
                memoryRepo.create({
                    petId,
                    memoryType: items[i].memoryType,
                    summary: items[i].summary,
                    embedding: JSON.stringify(vec),
                    importance: 1.0,
                    accessCount: 0
                })
            )
            existingVecs.push({ id: 'new', vec })
            saved++
        }
    }

    // Mark all fetched messages as consolidated
    const { In } = await import('typeorm')
    await messageRepo.update({ id: In(messages.map((m: any) => m.id)) }, { consolidated: true })

    return saved
}

/**
 * P3: Decay importance of memories not accessed in DECAY_DAYS.
 * P4: After decay, refresh personalityNarrative if enough active memories exist.
 * Meant to be called asynchronously — errors are silently ignored.
 */
export async function decayAndRefresh(params: { petId: string; memoryRepo: any; petRepo: any; chatModel?: BaseChatModel }): Promise<void> {
    const { petId, memoryRepo, petRepo, chatModel } = params

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - DECAY_DAYS)

    const { LessThan } = await import('typeorm')
    const stale: any[] = await memoryRepo.find({
        where: { petId, lastAccessedAt: LessThan(cutoff) }
    })

    for (const m of stale) {
        const newImportance = Math.max(0.05, m.importance * DECAY_FACTOR)
        await memoryRepo.update(m.id, { importance: newImportance })
    }

    // P4: Refresh personalityNarrative if there are significant active memories
    if (!chatModel) return
    const activeMemories: any[] = await memoryRepo.find({ where: { petId } })
    const highImportance = activeMemories.filter((m: any) => m.importance >= 0.5)
    if (highImportance.length < 3) return

    const summaries = highImportance
        .sort((a: any, b: any) => b.importance * b.accessCount - a.importance * a.accessCount)
        .slice(0, 10)
        .map((m: any) => `• ${m.summary}`)
        .join('\n')

    try {
        const pet = await petRepo.findOne({ where: { id: petId } })
        if (!pet) return

        const prompt = `根据以下关于AI宠物与用户互动的记忆，用100字以内中文描述这只宠物独特的个性和与用户的关系：\n\n${summaries}\n\n只输出性格描述，不要分点。`
        const resp = await chatModel.invoke([{ role: 'user', content: prompt }] as any)
        const narrative = typeof resp.content === 'string' ? resp.content.trim() : String(resp.content).trim()
        if (narrative.length > 10) {
            await petRepo.update(petId, { personalityNarrative: narrative, personalityNarrativeAt: new Date() })
        }
    } catch {
        // narrative refresh is best-effort
    }
}
