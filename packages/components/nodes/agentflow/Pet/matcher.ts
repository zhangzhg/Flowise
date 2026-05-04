export interface CardMatch {
    cardId: string
    input: string
    output: string
    cardType: string
    score: number
    createdDate?: Date | string
}

function norm(v: number[]): number {
    let s = 0
    for (const x of v) s += x * x
    return Math.sqrt(s)
}

export function cosine(a: number[], b: number[]): number {
    if (!a.length || a.length !== b.length) return 0
    let dot = 0
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
    const n = norm(a) * norm(b)
    return n === 0 ? 0 : dot / n
}

export interface StoredCard {
    id: string
    input: string
    output: string
    cardType: string
    embedding: string // serialized number[]
    createdDate?: Date | string
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
            // Fallback for cards without embeddings (e.g. added via REST API)
            score = textOverlapScore(queryText, card.input)
        } else {
            continue
        }
        if (score >= minScore) {
            scored.push({
                cardId: card.id,
                input: card.input,
                output: card.output,
                cardType: card.cardType,
                score,
                createdDate: card.createdDate
            })
        }
    }
    // Sort by score DESC, then by createdDate DESC so reinforcement (re-feeding the
    // correct answer) naturally outranks an older wrong card with the same input.
    const ts = (d: Date | string | undefined): number => (d ? new Date(d).getTime() : 0)
    scored.sort((a, b) => {
        if (Math.abs(b.score - a.score) > 1e-6) return b.score - a.score
        return ts(b.createdDate) - ts(a.createdDate)
    })
    return scored.slice(0, topK)
}
