import { PERSONALITY_DIM } from './constants'

/**
 * Trait tag → PERSONALITY_DIM-dim delta vector.
 * Indices: [活泼, 好奇, 温和, 创意, 外向, 玩心, 共情, 顺从]
 */
export const TRAIT_VECTORS: Record<string, number[]> = {
    friendly: [0, 0, -0.5, 0, -0.4, 0, 0, 0],
    playful: [-0.5, 0, 0, 0, 0, -0.8, 0, 0],
    affectionate: [0, 0, -0.6, 0, 0, 0, -0.7, 0],
    curious: [0, -0.8, 0, -0.3, 0, 0, 0, 0],
    brave: [0, -0.5, 0, 0, 0, 0, 0, 0.6],
    shy: [0, 0, 0, 0, 0.8, 0, 0, -0.4],
    creative: [0, -0.4, -0.8, 0, 0, 0, 0, 0],
    practical: [0, 0, 0, 0.7, 0, 0, 0.5, 0],
    calm: [0.6, 0, 0, 0, 0, 0.4, 0, 0],
    energetic: [-0.7, 0, 0, 0, -0.3, 0, 0, 0],
    empathetic: [0, 0, 0, 0, 0, 0, -0.8, 0],
    rational: [0, 0, 0, 0.3, 0, 0, 0.8, 0],
    independent: [0, 0, 0, 0, 0.5, 0, 0, 0.7],
    obedient: [0, 0, 0, 0, 0, 0, 0, -0.7],
    serious: [0.3, 0, 0, 0, 0, 0.7, 0, 0]
}

// ── Vector operations ────────────────────────────────────────────────────────

export const zeroVec = (): number[] => new Array(PERSONALITY_DIM).fill(0)

export const clampVec = (v: number[]): number[] => v.map((x) => Math.max(-1, Math.min(1, x)))

export const addVecs = (a: number[], b: number[]): number[] => a.map((x, i) => x + (b[i] ?? 0))

export const scaleVec = (v: number[], s: number): number[] => v.map((x) => x * s)

export function parseVec(val: string | null | undefined): number[] {
    if (!val) return zeroVec()
    try {
        const v = JSON.parse(val)
        return Array.isArray(v) && v.length === PERSONALITY_DIM ? (v as number[]) : zeroVec()
    } catch {
        return zeroVec()
    }
}

// ── Trait → personality delta ────────────────────────────────────────────────

export function computePersonalityDelta(traitTags: string[]): number[] {
    const delta = zeroVec()
    for (const tag of traitTags) {
        const vec = TRAIT_VECTORS[tag.toLowerCase()]
        if (vec) {
            for (let i = 0; i < PERSONALITY_DIM; i++) delta[i] += vec[i]
        }
    }
    return delta
}
