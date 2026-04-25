import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import petsService from '../../services/pet'

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

export default {
    getMyPet,
    createMyPet,
    updateMyPet,
    deleteMyPet,
    feedCard,
    listCards
}
