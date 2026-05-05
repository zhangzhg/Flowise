export type PetStage = 'egg' | 'babble' | 'echo' | 'talk' | 'mature'

export interface StageInfo {
    stage: PetStage
    minProgress: number
    maxProgress: number | null
}

// progress = cardCount * 2 + chatTurns
// Examples to reach each stage:
//   babble : 1 card  OR  2  chat turns
//   echo   : 3 cards OR  6  chat turns
//   talk   : 7 cards OR  14 chat turns
//   mature : 10 cards OR 20 chat turns (tools enabled)
const STAGE_TABLE: StageInfo[] = [
    { stage: 'egg', minProgress: 0, maxProgress: 1 },
    { stage: 'babble', minProgress: 2, maxProgress: 5 },
    { stage: 'echo', minProgress: 6, maxProgress: 13 },
    { stage: 'talk', minProgress: 14, maxProgress: 19 },
    { stage: 'mature', minProgress: 20, maxProgress: null }
]

export function deriveProgress(cardCount: number, chatTurns: number): number {
    const c = Number.isFinite(cardCount) && cardCount >= 0 ? Math.floor(cardCount) : 0
    const t = Number.isFinite(chatTurns) && chatTurns >= 0 ? Math.floor(chatTurns) : 0
    return c * 2 + t
}

export function deriveStage(cardCount: number, chatTurns: number = 0): PetStage {
    const progress = deriveProgress(cardCount, chatTurns)
    for (const row of STAGE_TABLE) {
        if (progress >= row.minProgress && (row.maxProgress === null || progress <= row.maxProgress)) {
            return row.stage
        }
    }
    return 'egg'
}

export function deriveLevel(exp: number): number {
    const safe = Number.isFinite(exp) && exp >= 0 ? exp : 0
    return Math.max(1, Math.floor(Math.sqrt(safe / 100)) + 1)
}

export const STAGE_ORDER: PetStage[] = ['egg', 'babble', 'echo', 'talk', 'mature']
