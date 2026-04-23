import { PetStage } from './stage'
import { CardMatch } from './matcher'
import { IPetAttributes } from '../../Interface'

const PRIMITIVE_SOUNDS = ['...', '?', '~', '咕', '...?', '嗯?']

function randomPrimitive(): string {
    return PRIMITIVE_SOUNDS[Math.floor(Math.random() * PRIMITIVE_SOUNDS.length)]
}

export interface ResponderInput {
    stage: PetStage
    userInput: string
    matches: CardMatch[] // action cards excluded, already sorted by score desc
    actionMatches: CardMatch[] // only action cards
    attributes: IPetAttributes
    personalityNarrative?: string
    recentVocab?: string[] // last N card inputs, for echo whitelist
}

export interface ResponderOutput {
    text: string
    usedCardId?: string
    usedTool?: string // intent label from action card
}

const BABBLE_THRESHOLD = 0.75

export function buildEggResponse(): ResponderOutput {
    return { text: randomPrimitive() }
}

export function buildBabbleResponse(matches: CardMatch[]): ResponderOutput {
    if (matches.length && matches[0].score >= BABBLE_THRESHOLD) {
        return { text: matches[0].output, usedCardId: matches[0].cardId }
    }
    return { text: randomPrimitive() }
}

export function buildEchoSystemPrompt(recentVocab: string[], narrative: string | undefined): string {
    const vocabSection = recentVocab.length
        ? `你只会使用以下词汇说话（超出范围的词用"..."代替）：\n${recentVocab.slice(0, 30).join('、')}`
        : '你的词汇量很少，只能说简单的词。'
    const personalitySection = narrative ? `你的性格：${narrative}` : ''
    return `你是一只刚学会说话的 AI 宠物。${vocabSection}\n${personalitySection}\n用最简单的语言回应，不超过15个字。`
}

export function buildTalkSystemPrompt(narrative: string | undefined): string {
    const personality = narrative ?? '你是一只温和、友善、充满好奇心的 AI 宠物。'
    return `你是一只 AI 宠物。${personality}\n用自然的语言回应用户，保持角色。不超过80个字。`
}

export function buildMatureSystemPrompt(narrative: string | undefined): string {
    const personality = narrative ?? '你是一只独特个性的 AI 宠物，有自己的想法和感受。'
    return `你是一只成熟的 AI 宠物。${personality}\n自由表达，保持角色一致。`
}

export function buildFewShotMessages(matches: CardMatch[]): Array<{ role: string; content: string }> {
    const msgs: Array<{ role: string; content: string }> = []
    for (const m of matches.slice(0, 5)) {
        msgs.push({ role: 'user', content: m.input })
        msgs.push({ role: 'assistant', content: m.output })
    }
    return msgs
}

export function selectStagePrompt(stage: PetStage, recentVocab: string[], narrative?: string): string {
    if (stage === 'echo') return buildEchoSystemPrompt(recentVocab, narrative)
    if (stage === 'mature') return buildMatureSystemPrompt(narrative)
    return buildTalkSystemPrompt(narrative)
}
