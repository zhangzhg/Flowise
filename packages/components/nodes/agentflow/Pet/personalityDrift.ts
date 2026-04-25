import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { PetStage } from './stage'
import { probeConversationTraits } from './traitProbe'

const DIM = 8

// Turn-level alpha per stage — more influence at higher stages
const STAGE_ALPHA: Partial<Record<PetStage, number>> = {
    echo: 0.005,
    talk: 0.015,
    mature: 0.02
}

function clampVec(vec: number[]): number[] {
    return vec.map((v) => Math.max(-1, Math.min(1, v)))
}

function addVecs(a: number[], b: number[]): number[] {
    return a.map((v, i) => v + (b[i] ?? 0))
}

function scaleVec(vec: number[], s: number): number[] {
    return vec.map((v) => v * s)
}

function parseJsonSafe(val: string | null | undefined): any {
    if (!val) return null
    try {
        return JSON.parse(val)
    } catch {
        return null
    }
}

function zeroVec(): number[] {
    return new Array(DIM).fill(0)
}

function parseVec(val: string | null | undefined): number[] {
    const v = parseJsonSafe(val)
    return Array.isArray(v) && v.length === DIM ? (v as number[]) : zeroVec()
}

/**
 * Turn-level drift: probe user text → apply small personality delta immediately.
 * Called after each LLM response in echo/talk/mature stages.
 */
export async function applyTurnDrift(params: {
    userText: string
    petReply: string
    stage: PetStage
    chatModel: BaseChatModel
    pet: any
    petRepo: any
    eventRepo: any
    chatId: string
}): Promise<void> {
    const { userText, petReply, stage, chatModel, pet, petRepo, eventRepo, chatId } = params

    const alpha = STAGE_ALPHA[stage]
    if (!alpha) return

    const rawDelta = await probeConversationTraits(userText, petReply, chatModel)

    // Skip if probe returned all zeros (LLM error or neutral message)
    if (rawDelta.every((v) => v === 0)) return

    const appliedDelta = scaleVec(rawDelta, alpha)

    const personalityVec = parseVec(pet.personalityVector)
    const newVec = clampVec(addVecs(personalityVec, appliedDelta))

    const turnIndex = await eventRepo.count({ where: { petId: pet.id, chatId, source: 'turn' } })

    await eventRepo.save(
        eventRepo.create({
            petId: pet.id,
            chatId,
            source: 'turn',
            rawDelta: JSON.stringify(rawDelta),
            appliedAlpha: alpha,
            appliedDelta: JSON.stringify(appliedDelta),
            turnIndex
        })
    )

    await petRepo.update(pet.id, { personalityVector: JSON.stringify(newVec) })
    // Mutate in-place so the caller sees updated state without a re-fetch
    pet.personalityVector = JSON.stringify(newVec)
}

/**
 * Session-level consolidation: compute weighted mean of turn deltas for the session,
 * then apply residual correction (session_target − already_applied).
 * Called lazily when a new chatId arrives (i.e. previous session just ended).
 */
export async function consolidateSession(params: { petId: string; petRepo: any; eventRepo: any; sessionChatId: string }): Promise<void> {
    const { petId, petRepo, eventRepo, sessionChatId } = params

    const turnEvents: any[] = await eventRepo.find({
        where: { petId, chatId: sessionChatId, source: 'turn' },
        order: { turnIndex: 'ASC' }
    })
    if (!turnEvents.length) return

    const n = turnEvents.length

    // Weighted mean of raw deltas — later turns have higher weight
    const weightedSum = zeroVec()
    let totalWeight = 0
    for (let i = 0; i < n; i++) {
        const w = i + 1
        const d = parseVec(turnEvents[i].rawDelta)
        for (let j = 0; j < DIM; j++) weightedSum[j] += w * d[j]
        totalWeight += w
    }
    const sessionMeanDelta = weightedSum.map((v) => v / totalWeight)

    // Session alpha scales with log(turnCount) so longer sessions matter more
    const alphaSession = 0.04 * Math.log(1 + n / 5)

    const sessionTarget = scaleVec(sessionMeanDelta, alphaSession)

    // Sum of already-applied turn deltas in this session
    const alreadyApplied = zeroVec()
    for (const ev of turnEvents) {
        const d = parseVec(ev.appliedDelta)
        for (let j = 0; j < DIM; j++) alreadyApplied[j] += d[j]
    }

    // Residual = what session-level says we should have, minus what turns already did
    const correction = sessionTarget.map((v, i) => v - alreadyApplied[i])

    // If correction is tiny, skip the write
    if (correction.every((v) => Math.abs(v) < 1e-6)) return

    // Re-fetch pet to get latest personality (may have been updated by other turns)
    const pet = await petRepo.findOne({ where: { id: petId } })
    if (!pet) return

    const personalityVec = parseVec(pet.personalityVector)
    const newVec = clampVec(addVecs(personalityVec, correction))

    await eventRepo.save(
        eventRepo.create({
            petId,
            chatId: sessionChatId,
            source: 'session',
            rawDelta: JSON.stringify(sessionMeanDelta),
            appliedAlpha: alphaSession,
            appliedDelta: JSON.stringify(correction),
            turnIndex: -1
        })
    )

    await petRepo.update(petId, { personalityVector: JSON.stringify(newVec) })
}

/**
 * Daily consolidation: compute residual correction from all events since last daily run.
 * Zero LLM calls — pure statistical aggregation of stored turn events.
 */
export async function consolidateDaily(params: {
    petId: string
    petRepo: any
    eventRepo: any
    since: Date // start of yesterday (or last daily date)
    until: Date // end of yesterday
}): Promise<void> {
    const { petId, petRepo, eventRepo, since, until } = params

    const { Between } = await import('typeorm')

    // Collect all turn events in the window
    const turnEvents: any[] = await eventRepo.find({
        where: { petId, source: 'turn', createdDate: Between(since, until) }
    })
    if (!turnEvents.length) return

    const n = turnEvents.length
    const meanDelta = zeroVec()
    for (const ev of turnEvents) {
        const d = parseVec(ev.rawDelta)
        for (let j = 0; j < DIM; j++) meanDelta[j] += d[j]
    }
    for (let j = 0; j < DIM; j++) meanDelta[j] /= n

    const alphaDaily = 0.1

    const dailyTarget = scaleVec(meanDelta, alphaDaily)

    // All events (turn + session) already applied in the window
    const allEvents: any[] = await eventRepo.find({
        where: { petId, createdDate: Between(since, until) }
    })
    const alreadyApplied = zeroVec()
    for (const ev of allEvents) {
        if (ev.source === 'daily') continue // skip prior daily events if re-run
        const d = parseVec(ev.appliedDelta)
        for (let j = 0; j < DIM; j++) alreadyApplied[j] += d[j]
    }

    const correction = dailyTarget.map((v, i) => {
        // Cap daily correction per dimension to prevent abuse
        const raw = v - alreadyApplied[i]
        return Math.max(-0.3, Math.min(0.3, raw))
    })

    if (correction.every((v) => Math.abs(v) < 1e-6)) return

    const pet = await petRepo.findOne({ where: { id: petId } })
    if (!pet) return

    const personalityVec = parseVec(pet.personalityVector)
    const newVec = clampVec(addVecs(personalityVec, correction))

    await eventRepo.save(
        eventRepo.create({
            petId,
            chatId: null,
            source: 'daily',
            rawDelta: JSON.stringify(meanDelta),
            appliedAlpha: alphaDaily,
            appliedDelta: JSON.stringify(correction),
            turnIndex: -1
        })
    )

    await petRepo.update(petId, { personalityVector: JSON.stringify(newVec) })
}
