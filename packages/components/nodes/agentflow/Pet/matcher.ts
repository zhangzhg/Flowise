export interface CardMatch {
    cardId: string
    input: string
    output: string
    cardType: string
    score: number
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
    const q = query.toLowerCase()
    const c = cardInput.toLowerCase()
    if (c.includes(q) || q.includes(c)) return 0.6
    const qChars = new Set(q.replace(/\s/g, ''))
    const cChars = c.replace(/\s/g, '')
    let hits = 0
    for (const ch of cChars) if (qChars.has(ch)) hits++
    return qChars.size > 0 ? Math.min(0.55, hits / qChars.size) : 0
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
                score
            })
        }
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK)
}
