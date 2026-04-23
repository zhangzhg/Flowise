import { deriveLevel, deriveStage } from './stage'

describe('deriveStage', () => {
    it('returns egg for 0 cards', () => {
        expect(deriveStage(0)).toBe('egg')
    })

    it('returns babble for 1..19 cards', () => {
        expect(deriveStage(1)).toBe('babble')
        expect(deriveStage(10)).toBe('babble')
        expect(deriveStage(19)).toBe('babble')
    })

    it('returns echo for 20..99 cards', () => {
        expect(deriveStage(20)).toBe('echo')
        expect(deriveStage(99)).toBe('echo')
    })

    it('returns talk for 100..499 cards', () => {
        expect(deriveStage(100)).toBe('talk')
        expect(deriveStage(499)).toBe('talk')
    })

    it('returns mature for >=500 cards', () => {
        expect(deriveStage(500)).toBe('mature')
        expect(deriveStage(10_000)).toBe('mature')
    })

    it('handles invalid input as egg', () => {
        expect(deriveStage(-5)).toBe('egg')
        expect(deriveStage(Number.NaN)).toBe('egg')
    })
})

describe('deriveLevel', () => {
    it('returns 1 at 0 exp', () => {
        expect(deriveLevel(0)).toBe(1)
    })

    it('grows with sqrt(exp/100)', () => {
        expect(deriveLevel(100)).toBe(2)
        expect(deriveLevel(400)).toBe(3)
        expect(deriveLevel(900)).toBe(4)
    })

    it('clamps invalid input', () => {
        expect(deriveLevel(-100)).toBe(1)
        expect(deriveLevel(Number.NaN)).toBe(1)
    })
})
