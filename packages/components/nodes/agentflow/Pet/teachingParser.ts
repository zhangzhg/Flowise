export type CardType = 'vocab' | 'phrase' | 'action'

export interface ParsedCard {
    cardType: CardType
    input: string
    output: string
    traitTags: string[]
}

// Trait tag map: tag → 8-dim delta [活泼,好奇,温和,创意,外向,玩心,共情,顺从]
export const TRAIT_VECTORS: Record<string, number[]> = {
    friendly: [0, 0, -0.5, 0, -0.4, 0, 0, 0],
    playful: [-0.5, 0, 0, 0, 0, -0.8, 0, 0],
    affectionate: [0, 0, -0.6, 0, 0, 0, -0.7, 0],
    curious: [0, -0.8, 0, -0.3, 0, 0, 0, 0],
    brave: [0, -0.5, 0, 0, 0, 0, 0, 0.6],
    shy: [0, 0, 0, 0, 0.8, 0, 0, -0.4],
    creative: [0, -0.4, -0.8, 0, 0, 0, 0, 0],
    practical: [0, 0, 0, 0.7, 0, 0, 0.5, 0],
    calm: [0.6, 0, 0, 0, 0, 0.4, 0, 0],
    energetic: [-0.7, 0, 0, 0, -0.3, 0, 0, 0],
    empathetic: [0, 0, 0, 0, 0, 0, -0.8, 0],
    rational: [0, 0, 0, 0.3, 0, 0, 0.8, 0],
    independent: [0, 0, 0, 0, 0.5, 0, 0, 0.7],
    obedient: [0, 0, 0, 0, 0, 0, 0, -0.7],
    serious: [0.3, 0, 0, 0, 0, 0.7, 0, 0]
}

// regex patterns: [zh regex, en regex] → cardType + capture group mapping
const TEACH_PATTERNS: Array<{
    re: RegExp
    type: CardType
    inputGroup: number
    outputGroup: number
    defaultTags?: string[]
}> = [
    // 跟我读:你好
    { re: /^跟我读[：:]\s*(.+)$/su, type: 'vocab', inputGroup: 1, outputGroup: 1, defaultTags: [] },
    // repeat after me: hello
    { re: /^repeat\s+after\s+me[：:]\s*(.+)$/isu, type: 'vocab', inputGroup: 1, outputGroup: 1, defaultTags: [] },

    // 跟我学:看到妈妈说"妈妈你好"
    { re: /^跟我学[：:]\s*(.+?)[说回][""](.+)[""]$/su, type: 'phrase', inputGroup: 1, outputGroup: 2, defaultTags: [] },
    // 跟我学:你好→你好  /  跟我学:你好=>你好
    { re: /^跟我学[：:]\s*(.+?)\s*(?:→|=>|->)\s*(.+)$/su, type: 'phrase', inputGroup: 1, outputGroup: 2, defaultTags: [] },
    // 记住:早上好=>早上好呀  /  记住:早上好→早上好呀
    { re: /^记住[：:]\s*(.+?)\s*(?:=>|→|->)\s*(.+)$/su, type: 'phrase', inputGroup: 1, outputGroup: 2, defaultTags: [] },
    // learn: say "good morning" when greeting
    { re: /^learn[：:]?\s+say\s+[""](.+?)[""]\s+when\s+(.+)$/isu, type: 'phrase', inputGroup: 1, outputGroup: 2, defaultTags: [] },

    // 教你做:听到"玩"就play
    { re: /^教你做[：:]\s*(.+?)就\s*(.+)$/su, type: 'action', inputGroup: 1, outputGroup: 2, defaultTags: ['energetic'] },
    // do: when you hear "play" do play
    {
        re: /^do[：:]?\s+when\s+.+?hear\s+[""](.+?)[""]\s+do\s+(.+)$/isu,
        type: 'action',
        inputGroup: 1,
        outputGroup: 2,
        defaultTags: ['energetic']
    }
]

function clean(s: string): string {
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
        const input = clean(m[pat.inputGroup] ?? '')
        const output = clean(m[pat.outputGroup] ?? '')
        if (!input || !output) continue
        return {
            cardType: pat.type,
            input,
            output,
            traitTags: [...(pat.defaultTags ?? [])]
        }
    }
    return null
}

export function computePersonalityDelta(traitTags: string[]): number[] {
    const dim = 8
    const delta = new Array(dim).fill(0)
    for (const tag of traitTags) {
        const vec = TRAIT_VECTORS[tag.toLowerCase()]
        if (vec) {
            for (let i = 0; i < dim; i++) delta[i] += vec[i]
        }
    }
    return delta
}
