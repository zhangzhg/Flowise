import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { PERSONALITY_DIM } from './constants'

// Aligned with personalityVector convention in teachingParser.ts TRAIT_VECTORS
const PROBE_PROMPT = (userText: string, petReply: string) => `\
You are analyzing a virtual pet conversation to measure personality influence.
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

export async function probeConversationTraits(userText: string, petReply: string, chatModel: BaseChatModel): Promise<number[]> {
    const zero = () => new Array(PERSONALITY_DIM).fill(0)
    try {
        const response = await chatModel.invoke([{ role: 'user', content: PROBE_PROMPT(userText, petReply) }])
        const text = typeof response.content === 'string' ? response.content.trim() : ''
        const match = text.match(/\[[\s\d.,\-+eE]+\]/)
        if (!match) return zero()
        const arr = JSON.parse(match[0]) as unknown[]
        if (!Array.isArray(arr) || arr.length !== PERSONALITY_DIM) return zero()
        return arr.map((v) => Math.max(-1, Math.min(1, Number(v) || 0)))
    } catch {
        return zero()
    }
}
