export type PetStage = 'egg' | 'babble' | 'echo' | 'talk' | 'mature'

export interface StageInfo {
    stage: PetStage
    minCards: number
    maxCards: number | null
}

const STAGE_TABLE: StageInfo[] = [
    { stage: 'egg', minCards: 0, maxCards: 0 },
    { stage: 'babble', minCards: 1, maxCards: 19 },
    { stage: 'echo', minCards: 20, maxCards: 99 },
    { stage: 'talk', minCards: 100, maxCards: 499 },
    { stage: 'mature', minCards: 500, maxCards: null }
]

export function deriveStage(cardCount: number): PetStage {
    const safe = Number.isFinite(cardCount) && cardCount >= 0 ? Math.floor(cardCount) : 0
    for (const row of STAGE_TABLE) {
        if (safe >= row.minCards && (row.maxCards === null || safe <= row.maxCards)) {
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
