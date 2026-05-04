export type PetStage = 'egg' | 'babble' | 'echo' | 'talk' | 'mature'

export interface StageInfo {
    stage: PetStage
    minProgress: number
    maxProgress: number | null
}

// progress = cardCount * 2 + chatTurns
// Examples to reach each stage:
//   babble : 1 card  OR  2  chat turns
//   echo   : 20 cards OR  40 chat turns (~1 week active use)
//   talk   : 100 cards OR 200 chat turns (~2-3 weeks)
//   mature : 250 cards OR 500 chat turns (~1-2 months)
const STAGE_TABLE: StageInfo[] = [
    { stage: 'egg', minProgress: 0, maxProgress: 1 },
    { stage: 'babble', minProgress: 2, maxProgress: 39 },
    { stage: 'echo', minProgress: 40, maxProgress: 199 },
    { stage: 'talk', minProgress: 200, maxProgress: 499 },
    { stage: 'mature', minProgress: 500, maxProgress: null }
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
