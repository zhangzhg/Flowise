import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { PetStage } from './stage'
import { probeConversationTraits } from './traitProbe'
import { addVecs, clampVec, parseVec, scaleVec, zeroVec } from './personality'
import {
    PERSONALITY_DIM,
    STAGE_DRIFT_ALPHA,
    SESSION_ALPHA_BASE,
    SESSION_ALPHA_DIVISOR,
    DAILY_ALPHA,
    DAILY_CORRECTION_CAP
} from './constants'

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

    const alpha = STAGE_DRIFT_ALPHA[stage]
    if (!alpha) return

    const rawDelta = await probeConversationTraits(userText, petReply, chatModel)
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
    pet.personalityVector = JSON.stringify(newVec)
}

/**
 * Session-level consolidation: weighted mean of turn deltas → residual correction.
 * Called lazily when a new chatId arrives (previous session just ended).
 */
export async function consolidateSession(params: { petId: string; petRepo: any; eventRepo: any; sessionChatId: string }): Promise<void> {
    const { petId, petRepo, eventRepo, sessionChatId } = params

    const turnEvents: any[] = await eventRepo.find({
        where: { petId, chatId: sessionChatId, source: 'turn' },
        order: { turnIndex: 'ASC' }
    })
    if (!turnEvents.length) return

    const n = turnEvents.length
    const weightedSum = zeroVec()
    let totalWeight = 0
    for (let i = 0; i < n; i++) {
        const w = i + 1
        const d = parseVec(turnEvents[i].rawDelta)
        for (let j = 0; j < PERSONALITY_DIM; j++) weightedSum[j] += w * d[j]
        totalWeight += w
    }
    const sessionMeanDelta = weightedSum.map((v) => v / totalWeight)

    const alphaSession = SESSION_ALPHA_BASE * Math.log(1 + n / SESSION_ALPHA_DIVISOR)
    const sessionTarget = scaleVec(sessionMeanDelta, alphaSession)

    const alreadyApplied = zeroVec()
    for (const ev of turnEvents) {
        const d = parseVec(ev.appliedDelta)
        for (let j = 0; j < PERSONALITY_DIM; j++) alreadyApplied[j] += d[j]
    }

    const correction = sessionTarget.map((v, i) => v - alreadyApplied[i])
    if (correction.every((v) => Math.abs(v) < 1e-6)) return

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
 * Daily consolidation: statistical aggregation of stored turn events — zero LLM calls.
 */
export async function consolidateDaily(params: { petId: string; petRepo: any; eventRepo: any; since: Date; until: Date }): Promise<void> {
    const { petId, petRepo, eventRepo, since, until } = params

    const { Between } = await import('typeorm')

    const turnEvents: any[] = await eventRepo.find({
        where: { petId, source: 'turn', createdDate: Between(since, until) }
    })
    if (!turnEvents.length) return

    const n = turnEvents.length
    const meanDelta = zeroVec()
    for (const ev of turnEvents) {
        const d = parseVec(ev.rawDelta)
        for (let j = 0; j < PERSONALITY_DIM; j++) meanDelta[j] += d[j]
    }
    for (let j = 0; j < PERSONALITY_DIM; j++) meanDelta[j] /= n

    const dailyTarget = scaleVec(meanDelta, DAILY_ALPHA)

    const allEvents: any[] = await eventRepo.find({
        where: { petId, createdDate: Between(since, until) }
    })
    const alreadyApplied = zeroVec()
    for (const ev of allEvents) {
        if (ev.source === 'daily') continue
        const d = parseVec(ev.appliedDelta)
        for (let j = 0; j < PERSONALITY_DIM; j++) alreadyApplied[j] += d[j]
    }

    const correction = dailyTarget.map((v, i) => {
        const raw = v - alreadyApplied[i]
        return Math.max(-DAILY_CORRECTION_CAP, Math.min(DAILY_CORRECTION_CAP, raw))
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
            appliedAlpha: DAILY_ALPHA,
            appliedDelta: JSON.stringify(correction),
            turnIndex: -1
        })
    )

    await petRepo.update(petId, { personalityVector: JSON.stringify(newVec) })
}
