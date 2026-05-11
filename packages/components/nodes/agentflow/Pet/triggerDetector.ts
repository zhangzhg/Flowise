export interface TriggerContext {
    prompt: string
    userId?: string
}

export interface ConsolidateTrigger {
    userId: string
}

/**
 * Detect whether userText is a scheduler-fired trigger payload.
 *
 * Schedulers pass their `contextParams` as a flat JSON object via the question
 * field. We rely on the dedicated `agentCreated` discriminator field — not
 * fragile string-sniffing — to distinguish triggers from user-typed JSON.
 *
 * Returns the extracted prompt + userId, or null if not a trigger.
 */
export function detectScheduleTrigger(userText: string): TriggerContext | null {
    const t = (userText || '').trim()
    if (!t.startsWith('{')) return null

    try {
        const ctx = JSON.parse(t)
        if (!ctx?.agentCreated) return null
        if (typeof ctx.prompt !== 'string' || !ctx.prompt.trim()) return null
        return {
            prompt: ctx.prompt.trim(),
            userId: typeof ctx.userId === 'string' ? ctx.userId : undefined
        }
    } catch {
        return null
    }
}

/**
 * Detect whether userText is a background memory-consolidation trigger
 * sent by the server-side MemoryConsolidator cron.
 */
export function detectConsolidateTrigger(userText: string): ConsolidateTrigger | null {
    const t = (userText || '').trim()
    if (!t.startsWith('{')) return null
    try {
        const ctx = JSON.parse(t)
        if (ctx?.__consolidate__ !== true) return null
        if (typeof ctx.userId !== 'string' || !ctx.userId) return null
        return { userId: ctx.userId }
    } catch {
        return null
    }
}
