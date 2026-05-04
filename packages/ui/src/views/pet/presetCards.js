// Preset card packs for drag-and-drop feeding.
// Cards are submitted via existing /pet/me/cards (feedCard) endpoint.
// Embeddings are generated when the pet next chats; matcher.ts fallback
// (textOverlapScore) handles exact / containment matches without embeddings.

export const PRESET_PACKS = [
    {
        id: 'greetings',
        labelKey: 'pet.packGreetings',
        emoji: '👋',
        cards: [
            { cardType: 'phrase', input: '你好', output: '你好呀！' },
            { cardType: 'phrase', input: '早上好', output: '早安！' },
            { cardType: 'phrase', input: '晚安', output: '晚安，做个好梦！' },
            { cardType: 'phrase', input: '再见', output: '拜拜，记得想我哦~' },
            { cardType: 'phrase', input: '谢谢', output: '不客气~' },
            { cardType: 'phrase', input: '你叫什么名字', output: '我是你的宠物呀！' },
            { cardType: 'phrase', input: '你几岁', output: '我刚出生不久哦！' },
            { cardType: 'vocab', input: '是的', output: '嗯！' },
            { cardType: 'vocab', input: '不是', output: '不是哦~' },
            { cardType: 'vocab', input: '好的', output: '好嘞！' }
        ]
    },
    {
        id: 'emotions',
        labelKey: 'pet.packEmotions',
        emoji: '💗',
        cards: [
            { cardType: 'phrase', input: '我爱你', output: '我也爱你！', traitTags: ['affectionate'] },
            { cardType: 'phrase', input: '我想你了', output: '我也好想你！', traitTags: ['affectionate'] },
            { cardType: 'phrase', input: '我难过', output: '抱抱，我陪着你~', traitTags: ['empathetic'] },
            { cardType: 'phrase', input: '我开心', output: '太好啦，我也跟着开心！', traitTags: ['empathetic'] },
            { cardType: 'phrase', input: '我累了', output: '快去休息吧，我守着你~', traitTags: ['empathetic'] },
            { cardType: 'phrase', input: '别走', output: '我不走，一直都在！', traitTags: ['affectionate'] },
            { cardType: 'phrase', input: '夸夸我', output: '你真棒！我最喜欢你了！', traitTags: ['playful'] },
            { cardType: 'vocab', input: '生气', output: '别生气啦~', traitTags: ['empathetic'] },
            { cardType: 'vocab', input: '害怕', output: '别怕，有我在！', traitTags: ['brave'] },
            { cardType: 'vocab', input: '喜欢', output: '我也喜欢！', traitTags: ['friendly'] }
        ]
    },
    {
        id: 'actions',
        labelKey: 'pet.packActions',
        emoji: '⚡',
        cards: [
            { cardType: 'action', input: '玩', output: 'play', traitTags: ['playful'] },
            { cardType: 'action', input: '一起玩吧', output: 'play', traitTags: ['playful'] },
            { cardType: 'action', input: '吃饭', output: 'eat', traitTags: ['practical'] },
            { cardType: 'action', input: '我饿了', output: 'eat', traitTags: ['practical'] },
            { cardType: 'action', input: '睡觉', output: 'sleep', traitTags: ['calm'] },
            { cardType: 'action', input: '休息一下', output: 'sleep', traitTags: ['calm'] },
            { cardType: 'action', input: '查天气', output: 'weather', traitTags: ['curious'] },
            { cardType: 'action', input: '今天天气', output: 'weather', traitTags: ['curious'] },
            { cardType: 'action', input: '唱歌', output: 'sing', traitTags: ['creative'] },
            { cardType: 'action', input: '跳舞', output: 'dance', traitTags: ['energetic'] }
        ]
    }
]

export function getCardEmoji(cardType) {
    if (cardType === 'vocab') return '📖'
    if (cardType === 'phrase') return '💬'
    if (cardType === 'action') return '⚡'
    return '✨'
}
