import enLocale from './locales/en.json'
import zhLocale from './locales/zh.json'

type LocaleCode = 'en' | 'zh'

// Mutable so plugins can deep-merge their own translations at runtime.
const locales: Record<LocaleCode, Record<string, any>> = {
    en: JSON.parse(JSON.stringify(enLocale)),
    zh: JSON.parse(JSON.stringify(zhLocale))
}

const DEFAULT_LOCALE: LocaleCode = 'en'

const LOCALE_MAP: Record<string, LocaleCode> = {
    zh: 'zh',
    'zh-cn': 'zh',
    'zh-tw': 'zh',
    'zh-hk': 'zh',
    'zh-sg': 'zh',
    en: 'en',
    'en-us': 'en',
    'en-gb': 'en'
}

interface LanguagePreference {
    code: string
    quality: number
}

export function parseAcceptLanguage(acceptLanguage: string | undefined): LocaleCode {
    if (!acceptLanguage) {
        return DEFAULT_LOCALE
    }

    const preferences: LanguagePreference[] = acceptLanguage
        .split(',')
        .map((lang) => {
            const parts = lang.trim().split(';')
            const code = parts[0].toLowerCase().trim()
            let quality = 1.0

            for (const part of parts.slice(1)) {
                const [key, value] = part.trim().split('=')
                if (key === 'q' && value) {
                    quality = parseFloat(value)
                }
            }

            return { code, quality }
        })
        .sort((a, b) => b.quality - a.quality)

    for (const pref of preferences) {
        const normalizedCode = LOCALE_MAP[pref.code]
        if (normalizedCode) {
            return normalizedCode
        }

        const baseCode = pref.code.split('-')[0]
        const normalizedBaseCode = LOCALE_MAP[baseCode]
        if (normalizedBaseCode) {
            return normalizedBaseCode
        }
    }

    return DEFAULT_LOCALE
}

function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
    const keys = path.split('.')
    let current: unknown = obj

    for (const key of keys) {
        if (current && typeof current === 'object' && key in current) {
            current = (current as Record<string, unknown>)[key]
        } else {
            return undefined
        }
    }

    return typeof current === 'string' ? current : undefined
}

export function translate(key: string, locale: LocaleCode = DEFAULT_LOCALE, params?: Record<string, string>): string {
    const localeData = locales[locale] || locales[DEFAULT_LOCALE]

    let value = getNestedValue(localeData as unknown as Record<string, unknown>, key)

    if (!value) {
        if (locale !== DEFAULT_LOCALE) {
            value = getNestedValue(locales[DEFAULT_LOCALE] as unknown as Record<string, unknown>, key)
        }
        if (!value) {
            return key
        }
    }

    if (params) {
        for (const [paramKey, paramValue] of Object.entries(params)) {
            value = value.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), paramValue)
        }
    }

    return value
}

export function getNodeTranslation(nodeName: string, field: 'label' | 'description', locale: LocaleCode = DEFAULT_LOCALE): string {
    const key = `nodes.${nodeName}.${field}`
    return translate(key, locale)
}

export function getInputTranslation(nodeName: string, inputName: string, locale: LocaleCode = DEFAULT_LOCALE): string {
    const key = `nodes.${nodeName}.inputs.${inputName}`
    return translate(key, locale)
}

export function getOptionTranslation(nodeName: string, optionName: string, locale: LocaleCode = DEFAULT_LOCALE): string {
    const key = `nodes.${nodeName}.options.${optionName}`
    return translate(key, locale)
}

export function getDescriptionTranslation(nodeName: string, descName: string, locale: LocaleCode = DEFAULT_LOCALE): string {
    const key = `nodes.${nodeName}.descriptions.${descName}`
    return translate(key, locale)
}

export function getPlaceholderTranslation(nodeName: string, placeholderName: string, locale: LocaleCode = DEFAULT_LOCALE): string {
    const key = `nodes.${nodeName}.placeholders.${placeholderName}`
    return translate(key, locale)
}

export function getOutputTranslation(nodeName: string, outputName: string, locale: LocaleCode = DEFAULT_LOCALE): string {
    const key = `nodes.${nodeName}.outputs.${outputName}`
    return translate(key, locale)
}

function deepMerge(target: Record<string, any>, source: Record<string, any>): void {
    for (const key of Object.keys(source)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            if (!target[key] || typeof target[key] !== 'object') target[key] = {}
            deepMerge(target[key], source[key])
        } else {
            target[key] = source[key]
        }
    }
}

export function mergePluginTranslations(en: Record<string, any>, zh: Record<string, any>): void {
    deepMerge(locales.en, en)
    deepMerge(locales.zh, zh)
}

export { LocaleCode, locales }
