import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { Embeddings } from '@langchain/core/embeddings'

// ── Stage ────────────────────────────────────────────────────────────────────

export type PetStage = 'egg' | 'babble' | 'echo' | 'talk' | 'mature'

export interface StageInfo {
    stage: PetStage
    minCards: number
    maxCards: number | null
}

const STAGE_TABLE: StageInfo[] = [
    { stage: 'egg', minCards: 0, maxCards: 0 },
    { stage: 'babble', minCards: 1, maxCards: 19 },
    { stage: 'echo', minCards: 20, maxCards: 99 },
    { stage: 'talk', minCards: 100, maxCards: 499 },
    { stage: 'mature', minCards: 500, maxCards: null }
]

export function deriveProgress(cardCount: number, chatTurns: number): number {
    return cardCount * 2 + chatTurns
}

export function deriveStage(cardCount: number, _chatTurns?: number): PetStage {
    const safe = Number.isFinite(cardCount) && cardCount >= 0 ? Math.floor(cardCount) : 0
    for (const row of STAGE_TABLE) {
        if (safe >= row.minCards && (row.maxCards === null || safe <= row.maxCards)) {
            return row.stage
        }
    }
    return 'egg'
}

export function deriveLevel(exp: number): number {
    const safe = Number.isFinite(exp) && exp >= 0 ? exp : 0
    return Math.max(1, Math.floor(Math.sqrt(safe / 100)) + 1)
}

export const STAGE_ORDER: PetStage[] = ['egg', 'babble', 'echo', 'talk', 'mature']

// ── Constants ────────────────────────────────────────────────────────────────

export const PERSONALITY_DIM = 8
export const ACTION_TOPK = 3
export const ACTION_MATCH_THRESHOLD = 0.72
export const ECHO_RECALL_TOPK = 5
export const CHAT_RECALL_TOPK = 5
export const BABBLE_DIRECT_THRESHOLD = 0.75

const STAGE_MAX_CHARS: Partial<Record<PetStage, number>> = {
    echo: 15,
    talk: 80,
    mature: 200
}

// ── Triggers ─────────────────────────────────────────────────────────────────

export interface TriggerContext {
    prompt: string
    userId?: string
}

export interface ConsolidateTrigger {
    userId: string
}

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

// ── Teaching ─────────────────────────────────────────────────────────────────

export type CardType = 'vocab' | 'phrase' | 'action'

export interface ParsedCard {
    cardType: CardType
    input: string
    output: string
    traitTags: string[]
}

const TEACH_PATTERNS: Array<{
    re: RegExp
    type: CardType
    inputGroup: number
    outputGroup: number
    defaultTags?: string[]
}> = [
    { re: /^跟我读[：:]\s*(.+)$/su, type: 'vocab', inputGroup: 1, outputGroup: 1, defaultTags: [] },
    { re: /^repeat\s+after\s+me[：:]\s*(.+)$/isu, type: 'vocab', inputGroup: 1, outputGroup: 1, defaultTags: [] },
    { re: /^跟我学[：:]\s*(.+?)[说回][""](.+)[""]$/su, type: 'phrase', inputGroup: 1, outputGroup: 2, defaultTags: [] },
    { re: /^跟我学[：:]\s*(.+?)\s*(?:→|=>|->)\s*(.+)$/su, type: 'phrase', inputGroup: 1, outputGroup: 2, defaultTags: [] },
    { re: /^记住[：:]\s*(.+?)\s*(?:=>|→|->)\s*(.+)$/su, type: 'phrase', inputGroup: 1, outputGroup: 2, defaultTags: [] },
    { re: /^learn[：:]?\s+say\s+[""](.+?)[""]\s+when\s+(.+)$/isu, type: 'phrase', inputGroup: 1, outputGroup: 2, defaultTags: [] },
    { re: /^教你做[：:]\s*(.+?)就\s*(.+)$/su, type: 'action', inputGroup: 1, outputGroup: 2, defaultTags: ['energetic'] },
    {
        re: /^do[：:]?\s+when\s+.+?hear\s+[""](.+?)[""]\s+do\s+(.+)$/isu,
        type: 'action',
        inputGroup: 1,
        outputGroup: 2,
        defaultTags: ['energetic']
    }
]

function cleanToken(s: string): string {
    return s
        .trim()
        .replace(/["""''']/g, '')
        .trim()
}

export function parseTeachingCommand(text: string): ParsedCard | null {
    const t = (text || '').trim()
    if (!t) return null
    for (const pat of TEACH_PATTERNS) {
        const m = pat.re.exec(t)
        if (!m) continue
        const input = cleanToken(m[pat.inputGroup] ?? '')
        const output = cleanToken(m[pat.outputGroup] ?? '')
        if (!input || !output) continue
        return { cardType: pat.type, input, output, traitTags: [...(pat.defaultTags ?? [])] }
    }
    return null
}

// ── Localized Responses ───────────────────────────────────────────────────────

const PRIMITIVE_SOUNDS_ZH = ['...', '?', '~', '咕', '...?', '嗯?']
const PRIMITIVE_SOUNDS_EN = ['...', '?', '~', 'peep', '...?', 'hmm?']

export function pickPrimitiveSound(language: string = 'zh'): string {
    const pool = language === 'zh' ? PRIMITIVE_SOUNDS_ZH : PRIMITIVE_SOUNDS_EN
    return pool[Math.floor(Math.random() * pool.length)]
}

export function buildEggResponse(language: string = 'zh'): { text: string } {
    return { text: pickPrimitiveSound(language) }
}

export function buildBabbleResponse(matches: CardMatch[], language: string = 'zh'): { text: string } {
    if (matches.length && matches[0].score >= BABBLE_DIRECT_THRESHOLD) {
        return { text: matches[0].output }
    }
    return { text: pickPrimitiveSound(language) }
}

// ── Personality Vec Helpers ───────────────────────────────────────────────────

export function zeroVec(): number[] {
    return new Array(PERSONALITY_DIM).fill(0)
}

export function parseVec(val: string | null | undefined): number[] {
    if (!val) return zeroVec()
    try {
        const v = JSON.parse(val)
        return Array.isArray(v) && v.length === PERSONALITY_DIM ? (v as number[]) : zeroVec()
    } catch {
        return zeroVec()
    }
}

export function clampVec(v: number[]): number[] {
    return v.map((x) => Math.max(-1, Math.min(1, x)))
}

export function addVecs(a: number[], b: number[]): number[] {
    return a.map((x, i) => x + (b[i] ?? 0))
}

export function scaleVec(v: number[], s: number): number[] {
    return v.map((x) => x * s)
}

// ── Matching ──────────────────────────────────────────────────────────────────

export interface StoredCard {
    id: string
    input: string
    output: string
    cardType: string
    embedding: string
}

export interface CardMatch {
    cardId: string
    input: string
    output: string
    cardType: string
    score: number
}

export function cosine(a: number[], b: number[]): number {
    if (!a.length || a.length !== b.length) return 0
    let dot = 0,
        sa = 0,
        sb = 0
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i]
        sa += a[i] * a[i]
        sb += b[i] * b[i]
    }
    const n = Math.sqrt(sa) * Math.sqrt(sb)
    return n === 0 ? 0 : dot / n
}

function parseEmbedding(raw: string | null | undefined): number[] {
    if (!raw) return []
    try {
        const v = JSON.parse(raw)
        return Array.isArray(v) ? v : []
    } catch {
        return []
    }
}

function textOverlapScore(query: string, cardInput: string): number {
    const q = query.trim().toLowerCase()
    const c = cardInput.trim().toLowerCase()
    if (!q || !c) return 0
    if (q === c) return 1
    if (c.includes(q) || q.includes(c)) {
        const ratio = Math.min(q.length, c.length) / Math.max(q.length, c.length)
        return 0.8 + 0.15 * ratio
    }
    const qChars = new Set(q.replace(/\s/g, ''))
    const cChars = c.replace(/\s/g, '')
    let hits = 0
    for (const ch of cChars) if (qChars.has(ch)) hits++
    return qChars.size > 0 ? Math.min(0.7, hits / qChars.size) : 0
}

export function findTopMatches(
    queryEmbedding: number[],
    cards: StoredCard[],
    topK: number = 5,
    minScore: number = 0,
    queryText?: string
): CardMatch[] {
    if (!queryEmbedding.length) return []
    const scored: CardMatch[] = []
    for (const card of cards) {
        const emb = parseEmbedding(card.embedding)
        let score: number
        if (emb.length) {
            score = cosine(queryEmbedding, emb)
        } else if (queryText) {
            score = textOverlapScore(queryText, card.input)
        } else {
            continue
        }
        if (score >= minScore) {
            scored.push({ cardId: card.id, input: card.input, output: card.output, cardType: card.cardType, score })
        }
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK)
}

// ── Memory ────────────────────────────────────────────────────────────────────

export interface MemoryResult {
    id: string
    summary: string
    memoryType: string
    similarity: number
    importance: number
}

const MEMORY_CERTAIN = 0.75
const MEMORY_PROBABLE = 0.55

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
            const rawSim = cosine(queryVec, vec)
            const weightedSim = rawSim * Math.max(0.5, Math.min(1.5, m.importance as number))
            scored.push({
                id: m.id as string,
                summary: m.summary as string,
                memoryType: m.memoryType as string,
                similarity: weightedSim,
                importance: m.importance as number
            })
        } catch {
            /* skip malformed rows */
        }
    }
    scored.sort((a, b) => b.similarity - a.similarity)
    const top = scored.slice(0, limit)

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
        highConf: top.filter((x) => x.similarity >= MEMORY_CERTAIN),
        midConf: top.filter((x) => x.similarity >= MEMORY_PROBABLE && x.similarity < MEMORY_CERTAIN)
    }
}

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

// ── Prompts ───────────────────────────────────────────────────────────────────

export function selectStagePrompt(stage: PetStage, recentVocab: string[], narrative?: string, memorySection: string = ''): string {
    const maxChars = STAGE_MAX_CHARS[stage] ?? 80
    if (stage === 'echo') {
        const vocabSection = recentVocab.length
            ? `你只会使用以下词汇说话（超出范围的词用"..."代替）：\n${recentVocab.slice(0, 30).join('、')}`
            : '你的词汇量很少，只能说简单的词。'
        const personalitySection = narrative ? `你的性格：${narrative}` : ''
        return `你是一只刚学会说话的 AI 宠物。${vocabSection}\n${personalitySection}\n用最简单的语言回应，不超过${maxChars}个字。`
    }
    if (stage === 'mature') {
        const personality = narrative ?? '你是一只独特个性的 AI 宠物，有自己的想法和感受。'
        return `你是一只成熟的 AI 宠物。${personality}${memorySection}\n自由表达，保持角色一致。`
    }
    const personality = narrative ?? '你是一只温和、友善、充满好奇心的 AI 宠物。'
    return `你是一只 AI 宠物。${personality}${memorySection}\n用自然的语言回应用户，保持角色。不超过${maxChars}个字。`
}

export function buildSystemPromptWithFewShot(
    stage: PetStage,
    recentVocab: string[],
    narrative: string | undefined,
    memorySection: string,
    fewShotMatches: Array<{ input: string; output: string }>
): string {
    const base = selectStagePrompt(stage, recentVocab, narrative, memorySection)
    if (!fewShotMatches.length) return base
    const examples = fewShotMatches
        .slice(0, 5)
        .map((m) => `用户：${m.input}\n宠物：${m.output}`)
        .join('\n---\n')
    return `${base}\n\n【参考对话示例】\n${examples}`
}

// ── Personality Drift ─────────────────────────────────────────────────────────

const STAGE_ALPHA: Partial<Record<PetStage, number>> = {
    echo: 0.005,
    talk: 0.015,
    mature: 0.02
}

const buildProbePrompt = (userText: string, petReply: string) =>
    `You are analyzing a virtual pet conversation to measure personality influence.
Rate how much the USER's message pushes the pet's personality along 8 dimensions.
Output ONLY a valid JSON array of exactly 8 floats in the range [-1, +1].

Dimensions (positive = user reinforces this quality, negative = user contrasts it):
0: lively/active (vs calm/quiet)
1: curious/explorative (vs indifferent)
2: gentle/soft-spoken (vs assertive)
3: creative/imaginative (vs practical)
4: outgoing/social (vs shy/reserved)
5: playful/humorous (vs serious)
6: empathetic/emotional (vs rational)
7: obedient/agreeable (vs independent)

Rules:
- Keep absolute values ≤ 0.4 unless the message very strongly expresses a trait
- Zero means the message is neutral on that dimension
- Focus on what the USER is expressing, not the pet's reply

User: "${userText.slice(0, 300)}"
Pet: "${petReply.slice(0, 300)}"

Output ONLY the JSON array:`

async function probeConversationTraits(userText: string, petReply: string, chatModel: BaseChatModel): Promise<number[]> {
    try {
        const response = await chatModel.invoke([{ role: 'user', content: buildProbePrompt(userText, petReply) }])
        const text = typeof response.content === 'string' ? response.content.trim() : ''
        const match = text.match(/\[[\s\d.,\-+eE]+\]/)
        if (!match) return new Array(PERSONALITY_DIM).fill(0)
        const arr = JSON.parse(match[0]) as unknown[]
        if (!Array.isArray(arr) || arr.length !== PERSONALITY_DIM) return new Array(PERSONALITY_DIM).fill(0)
        return arr.map((v) => Math.max(-1, Math.min(1, Number(v) || 0)))
    } catch {
        return new Array(PERSONALITY_DIM).fill(0)
    }
}

export async function applyTurnDrift(params: {
    userText: string
    petReply: string
    stage: PetStage
    chatModel: BaseChatModel
    pet: any
    petRepo: any
    eventRepo: any
    chatId: string
}): Promise<void> {
    const { userText, petReply, stage, chatModel, pet, petRepo, eventRepo, chatId } = params

    const alpha = STAGE_ALPHA[stage]
    if (!alpha) return

    const rawDelta = await probeConversationTraits(userText, petReply, chatModel)
    if (rawDelta.every((v) => v === 0)) return

    const appliedDelta = scaleVec(rawDelta, alpha)
    const personalityVec = parseVec(pet.personalityVector as string | null)
    const newVec = clampVec(addVecs(personalityVec, appliedDelta))

    const turnIndex = (await eventRepo.count({ where: { petId: pet.id, chatId, source: 'turn' } })) as number

    await eventRepo.save(
        eventRepo.create({
            petId: pet.id,
            chatId,
            source: 'turn',
            rawDelta: JSON.stringify(rawDelta),
            appliedAlpha: alpha,
            appliedDelta: JSON.stringify(appliedDelta),
            turnIndex
        })
    )
    await petRepo.update(pet.id, { personalityVector: JSON.stringify(newVec) })
    pet.personalityVector = JSON.stringify(newVec)
}

// ── Consolidation ─────────────────────────────────────────────────────────────

const CONSOLIDATION_THRESHOLD = 8
const CONSOLIDATION_BATCH = 20
const DEDUP_THRESHOLD = 0.95
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

export async function consolidateMemories(params: {
    petId: string
    petName: string
    chatModel: BaseChatModel
    embeddings: Embeddings
    messageRepo: any
    memoryRepo: any
}): Promise<number> {
    const { petId, petName, chatModel, embeddings, messageRepo, memoryRepo } = params

    const messages: any[] = await messageRepo.find({
        where: { petId, consolidated: false },
        order: { createdAt: 'ASC' },
        take: CONSOLIDATION_BATCH
    })
    if (messages.length < CONSOLIDATION_THRESHOLD) return 0

    const formatted = messages.map((m) => `${m.role === 'user' ? '用户' : '宠物'}: ${m.content}`).join('\n')
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

    const existing: any[] = await memoryRepo.find({ where: { petId } })
    const existingVecs = existing.map((m: any) => {
        try {
            return { id: m.id as string, vec: JSON.parse(m.embedding) as number[] }
        } catch {
            return { id: m.id as string, vec: [] as number[] }
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

    const { In } = await import('typeorm')
    await messageRepo.update({ id: In(messages.map((m: any) => m.id)) }, { consolidated: true })
    return saved
}

export async function decayAndRefresh(params: { petId: string; memoryRepo: any; petRepo: any; chatModel?: BaseChatModel }): Promise<void> {
    const { petId, memoryRepo, petRepo, chatModel } = params

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - DECAY_DAYS)

    const { LessThan } = await import('typeorm')
    const stale: any[] = await memoryRepo.find({ where: { petId, lastAccessedAt: LessThan(cutoff) } })
    for (const m of stale) {
        const newImportance = Math.max(0.05, (m.importance as number) * DECAY_FACTOR)
        await memoryRepo.update(m.id, { importance: newImportance })
    }

    if (!chatModel) return
    const activeMemories: any[] = await memoryRepo.find({ where: { petId } })
    const highImportance = activeMemories.filter((m: any) => (m.importance as number) >= 0.5)
    if (highImportance.length < 3) return

    const summaries = highImportance
        .sort((a: any, b: any) => b.importance * b.accessCount - a.importance * a.accessCount)
        .slice(0, 10)
        .map((m: any) => `• ${m.summary}`)
        .join('\n')

    try {
        const pet = await petRepo.findOne({ where: { id: petId } })
        if (!pet) return
        const refreshPrompt = `根据以下关于AI宠物与用户互动的记忆，用100字以内中文描述这只宠物独特的个性和与用户的关系：\n\n${summaries}\n\n只输出性格描述，不要分点。`
        const resp = await chatModel.invoke([{ role: 'user', content: refreshPrompt }] as any)
        const narrative = typeof resp.content === 'string' ? resp.content.trim() : String(resp.content).trim()
        if (narrative.length > 10) {
            await petRepo.update(petId, { personalityNarrative: narrative, personalityNarrativeAt: new Date() })
        }
    } catch {
        /* best-effort */
    }
}
