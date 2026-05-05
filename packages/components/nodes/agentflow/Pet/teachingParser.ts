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
    // 跟我读:你好
    { re: /^跟我读[：:]\s*(.+)$/su, type: 'vocab', inputGroup: 1, outputGroup: 1 },
    // repeat after me: hello
    { re: /^repeat\s+after\s+me[：:]\s*(.+)$/isu, type: 'vocab', inputGroup: 1, outputGroup: 1 },

    // 跟我学:看到妈妈说"妈妈你好"
    { re: /^跟我学[：:]\s*(.+?)[说回][""](.+)[""]$/su, type: 'phrase', inputGroup: 1, outputGroup: 2 },
    // 跟我学:你好→你好  /  跟我学:你好=>你好
    { re: /^跟我学[：:]\s*(.+?)\s*(?:→|=>|->)\s*(.+)$/su, type: 'phrase', inputGroup: 1, outputGroup: 2 },
    // 记住:早上好=>早上好呀
    { re: /^记住[：:]\s*(.+?)\s*(?:=>|→|->)\s*(.+)$/su, type: 'phrase', inputGroup: 1, outputGroup: 2 },
    // learn: say "good morning" when greeting
    { re: /^learn[：:]?\s+say\s+[""](.+?)[""]\s+when\s+(.+)$/isu, type: 'phrase', inputGroup: 1, outputGroup: 2 },

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
        return { cardType: pat.type, input, output, traitTags: [...(pat.defaultTags ?? [])] }
    }
    return null
}
