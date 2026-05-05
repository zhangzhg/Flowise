import { PetStage } from './stage'
import { CardMatch } from './matcher'
import { BABBLE_DIRECT_THRESHOLD, STAGE_MAX_CHARS } from './constants'
import { pickPrimitiveSound } from './localizedResponses'
import { ToolDef, buildToolSchemaSection } from './tools'

export interface ResponderOutput {
    text: string
    usedCardId?: string
}

export function buildEggResponse(language: string = 'zh'): ResponderOutput {
    return { text: pickPrimitiveSound(language) }
}

export function buildBabbleResponse(matches: CardMatch[], language: string = 'zh'): ResponderOutput {
    if (matches.length && matches[0].score >= BABBLE_DIRECT_THRESHOLD) {
        return { text: matches[0].output, usedCardId: matches[0].cardId }
    }
    return { text: pickPrimitiveSound(language) }
}

export function buildEchoSystemPrompt(recentVocab: string[], narrative: string | undefined): string {
    const maxChars = STAGE_MAX_CHARS.echo
    const vocabSection = recentVocab.length
        ? `你只会使用以下词汇说话（超出范围的词用"..."代替）：\n${recentVocab.slice(0, 30).join('、')}`
        : '你的词汇量很少，只能说简单的词。'
    const personalitySection = narrative ? `你的性格：${narrative}` : ''
    return `你是一只刚学会说话的 AI 宠物。${vocabSection}\n${personalitySection}\n用最简单的语言回应，不超过${maxChars}个字。`
}

export function buildTalkSystemPrompt(narrative: string | undefined): string {
    const maxChars = STAGE_MAX_CHARS.talk
    const personality = narrative ?? '你是一只温和、友善、充满好奇心的 AI 宠物。'
    return `你是一只 AI 宠物。${personality}\n用自然的语言回应用户，保持角色。不超过${maxChars}个字。`
}

export function buildMatureSystemPrompt(narrative: string | undefined, tools: ToolDef[] = []): string {
    const personality = narrative ?? '你是一只独特个性的 AI 宠物，有自己的想法和感受。'
    return `你是一只成熟的 AI 宠物。${personality}\n自由表达，保持角色一致。${buildToolSchemaSection(tools)}`
}

export function buildFewShotMessages(matches: CardMatch[]): Array<{ role: string; content: string }> {
    const msgs: Array<{ role: string; content: string }> = []
    for (const m of matches.slice(0, 5)) {
        msgs.push({ role: 'user', content: m.input })
        msgs.push({ role: 'assistant', content: m.output })
    }
    return msgs
}

export function selectStagePrompt(stage: PetStage, recentVocab: string[], narrative?: string, tools: ToolDef[] = []): string {
    if (stage === 'echo') return buildEchoSystemPrompt(recentVocab, narrative)
    if (stage === 'mature') return buildMatureSystemPrompt(narrative, tools)
    return buildTalkSystemPrompt(narrative)
}
