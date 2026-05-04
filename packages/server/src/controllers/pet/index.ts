import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import petsService from '../../services/pet'
import schedulerService from '../../services/schedules'

function ensureAuth(req: Request): { userId: string; workspaceId: string } {
    const userId = req.user?.id
    const workspaceId = req.user?.activeWorkspaceId
    if (!userId) {
        throw new InternalFlowiseError(StatusCodes.UNAUTHORIZED, 'Authentication required')
    }
    if (!workspaceId) {
        throw new InternalFlowiseError(StatusCodes.PRECONDITION_FAILED, 'Active workspace required')
    }
    return { userId, workspaceId }
}

const getMyPet = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId } = ensureAuth(req)
        const pet = await petsService.getMyPet(userId)
        return res.json(pet)
    } catch (e) {
        next(e)
    }
}

const createMyPet = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId, workspaceId } = ensureAuth(req)
        const body = req.body || {}
        const pet = await petsService.createPet(userId, workspaceId, {
            name: body.name,
            language: body.language,
            growthCycle: body.growthCycle
        })
        return res.json(pet)
    } catch (e) {
        next(e)
    }
}

const updateMyPet = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId } = ensureAuth(req)
        const body = req.body || {}
        const pet = await petsService.updatePet(userId, {
            name: body.name,
            language: body.language,
            skinId: body.skinId,
            petFlowId: body.petFlowId,
            growthCycle: body.growthCycle
        })
        return res.json(pet)
    } catch (e) {
        next(e)
    }
}

const deleteMyPet = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId } = ensureAuth(req)
        const result = await petsService.deletePet(userId)
        return res.json(result)
    } catch (e) {
        next(e)
    }
}

const feedCard = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId } = ensureAuth(req)
        const body = req.body || {}
        const result = await petsService.feedCard(userId, {
            cardType: body.cardType,
            input: body.input,
            output: body.output,
            intentLabel: body.intentLabel,
            traitTags: body.traitTags,
            stateDelta: body.stateDelta,
            embedding: body.embedding,
            source: body.source,
            libraryName: body.libraryName
        })
        return res.json(result)
    } catch (e) {
        next(e)
    }
}

const listCards = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId } = ensureAuth(req)
        const page = parseInt((req.query.page as string) ?? '1', 10)
        const limit = parseInt((req.query.limit as string) ?? '50', 10)
        const cardType = (req.query.type as string) || undefined
        const result = await petsService.listCards(userId, {
            page: Number.isFinite(page) ? page : 1,
            limit: Number.isFinite(limit) ? limit : 50,
            cardType
        })
        return res.json(result)
    } catch (e) {
        next(e)
    }
}

// ─── Agent-created schedules (called by `schedule` tool from inside Pet flow) ──

const createMySchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId, workspaceId } = ensureAuth(req)
        const body = req.body ?? {}
        const pet = await petsService.getMyPet(userId)
        if (!pet?.petFlowId) {
            throw new InternalFlowiseError(StatusCodes.PRECONDITION_FAILED, 'Pet has no linked AgentFlow — link one first')
        }
        if (!body.name || !body.scheduleType || !body.prompt) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'name, scheduleType and prompt are required')
        }
        const saved = await schedulerService.createAgentSchedule({
            chatflowId: pet.petFlowId,
            workspaceId,
            name: body.name,
            scheduleType: body.scheduleType,
            cronExpression: body.cronExpression,
            interval: body.interval,
            delay: body.delay,
            timezone: body.timezone,
            prompt: body.prompt,
            userId,
            maxExecutions: body.maxExecutions
        })
        return res.json({ id: saved.id, name: saved.name, status: saved.status })
    } catch (e) {
        next(e)
    }
}

const cancelMySchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId } = ensureAuth(req)
        const pet = await petsService.getMyPet(userId)
        if (!pet?.petFlowId) {
            throw new InternalFlowiseError(StatusCodes.PRECONDITION_FAILED, 'Pet has no linked AgentFlow')
        }
        const removed = await schedulerService.cancelAgentScheduleByName({
            chatflowId: pet.petFlowId,
            userId,
            name: req.params.name
        })
        return res.json({ removed })
    } catch (e) {
        next(e)
    }
}

const listMySchedules = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { userId } = ensureAuth(req)
        const pet = await petsService.getMyPet(userId)
        if (!pet?.petFlowId) return res.json([])
        const schedules = await schedulerService.listAgentSchedules({ chatflowId: pet.petFlowId, userId })
        return res.json(
            schedules.map((s) => ({
                id: s.id,
                name: s.name,
                scheduleType: s.scheduleType,
                cronExpression: s.cronExpression,
                interval: s.interval,
                status: s.status,
                executionCount: s.executionCount,
                lastExecutedAt: s.lastExecutedAt
            }))
        )
    } catch (e) {
        next(e)
    }
}

export default {
    getMyPet,
    createMyPet,
    updateMyPet,
    deleteMyPet,
    feedCard,
    listCards,
    createMySchedule,
    cancelMySchedule,
    listMySchedules
}
