/**
 * Language-keyed display text for the pet.
 * Used for primitive sounds (egg/babble fallback) and teach acknowledgements.
 *
 * To add a language: extend each map with the new key. Caller falls back to 'zh'
 * when the language is missing or unknown, so partial coverage is safe.
 */

const PRIMITIVE_SOUNDS: Record<string, string[]> = {
    zh: ['...', '?', '~', '咕', '...?', '嗯?'],
    en: ['...', '?', '~', 'umm', '...?', 'huh?'],
    mixed: ['...', '?', '~', '咕', 'umm', 'huh?']
}

const TEACH_RESPONSES: Record<string, Record<string, string>> = {
    zh: {
        vocab: '咕！记住了！',
        phrase: '嗯！学会了！',
        action: '好的！我知道怎么做了！',
        default: '学会了！'
    },
    en: {
        vocab: 'Got it!',
        phrase: 'Learned!',
        action: 'OK, I know what to do!',
        default: 'Learned!'
    },
    mixed: {
        vocab: '咕！got it!',
        phrase: '嗯！learned!',
        action: '好的！got it!',
        default: 'OK!'
    }
}

const FALLBACK_LANG = 'zh'

export function pickPrimitiveSound(language: string = FALLBACK_LANG): string {
    const list = PRIMITIVE_SOUNDS[language] ?? PRIMITIVE_SOUNDS[FALLBACK_LANG]
    return list[Math.floor(Math.random() * list.length)]
}

export function buildTeachResponse(cardType: string, language: string = FALLBACK_LANG): string {
    const lang = TEACH_RESPONSES[language] ?? TEACH_RESPONSES[FALLBACK_LANG]
    return lang[cardType] ?? lang.default
}
