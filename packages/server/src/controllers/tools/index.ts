import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import toolsService from '../../services/tools'
import { getPageAndLimitParams } from '../../utils/pagination'
import { parseSkillPackage } from '../../utils/openclawSkill/parser'
import { adaptSkillToTool } from '../../utils/openclawSkill/adapter'

const randomGradient = () => {
    const c1 = Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, '0')
    const c2 = Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, '0')
    return `linear-gradient(rgba(0,0,0,0), rgba(0,0,0,0)), linear-gradient(103.49deg, #${c1} -28.13%, #${c2} 117.04%)`
}

const createTool = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.body) {
            throw new InternalFlowiseError(StatusCodes.PRECONDITION_FAILED, `Error: toolsController.createTool - body not provided!`)
        }
        const orgId = req.user?.activeOrganizationId
        if (!orgId) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Error: toolsController.createTool - organization ${orgId} not found!`)
        }
        const workspaceId = req.user?.activeWorkspaceId
        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Error: toolsController.createTool - workspace ${workspaceId} not found!`)
        }
        const body = req.body
        // Explicit allowlist — id/workspaceId/timestamps must not be overrideable by client
        const toolBody: Record<string, unknown> = {}
        if (body.name !== undefined) toolBody.name = body.name
        if (body.description !== undefined) toolBody.description = body.description
        if (body.color !== undefined) toolBody.color = body.color
        if (body.iconSrc !== undefined) toolBody.iconSrc = body.iconSrc
        if (body.schema !== undefined) toolBody.schema = body.schema
        if (body.func !== undefined) toolBody.func = body.func
        toolBody.workspaceId = workspaceId

        const apiResponse = await toolsService.createTool(toolBody, orgId)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const deleteTool = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.params === 'undefined' || !req.params.id) {
            throw new InternalFlowiseError(StatusCodes.PRECONDITION_FAILED, `Error: toolsController.deleteTool - id not provided!`)
        }
        const workspaceId = req.user?.activeWorkspaceId
        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Error: toolsController.deleteTool - workspace ${workspaceId} not found!`)
        }
        const apiResponse = await toolsService.deleteTool(req.params.id, workspaceId)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const getAllTools = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { page, limit } = getPageAndLimitParams(req)
        const apiResponse = await toolsService.getAllTools(req.user?.activeWorkspaceId, page, limit)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const getToolById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.params === 'undefined' || !req.params.id) {
            throw new InternalFlowiseError(StatusCodes.PRECONDITION_FAILED, `Error: toolsController.getToolById - id not provided!`)
        }
        const workspaceId = req.user?.activeWorkspaceId
        if (!workspaceId) {
            throw new InternalFlowiseError(
                StatusCodes.NOT_FOUND,
                `Error: toolsController.getToolById - workspace ${workspaceId} not found!`
            )
        }
        const apiResponse = await toolsService.getToolById(req.params.id, workspaceId)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const updateTool = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (typeof req.params === 'undefined' || !req.params.id) {
            throw new InternalFlowiseError(StatusCodes.PRECONDITION_FAILED, `Error: toolsController.updateTool - id not provided!`)
        }
        if (!req.body) {
            throw new InternalFlowiseError(StatusCodes.PRECONDITION_FAILED, `Error: toolsController.deleteTool - body not provided!`)
        }
        const workspaceId = req.user?.activeWorkspaceId
        if (!workspaceId) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Error: toolsController.updateTool - workspace ${workspaceId} not found!`)
        }
        const body = req.body
        // Explicit allowlist — id/workspaceId/timestamps must not be overrideable by client
        const toolBody: Record<string, unknown> = {}
        if (body.name !== undefined) toolBody.name = body.name
        if (body.description !== undefined) toolBody.description = body.description
        if (body.color !== undefined) toolBody.color = body.color
        if (body.iconSrc !== undefined) toolBody.iconSrc = body.iconSrc
        if (body.schema !== undefined) toolBody.schema = body.schema
        if (body.func !== undefined) toolBody.func = body.func
        const apiResponse = await toolsService.updateTool(req.params.id, toolBody, workspaceId)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

const importSkill = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const file = req.file
        if (!file) {
            throw new InternalFlowiseError(StatusCodes.PRECONDITION_FAILED, `Error: toolsController.importSkill - file not provided!`)
        }
        const orgId = req.user?.activeOrganizationId
        if (!orgId) {
            throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Error: toolsController.importSkill - organization ${orgId} not found!`)
        }
        const workspaceId = req.user?.activeWorkspaceId
        if (!workspaceId) {
            throw new InternalFlowiseError(
                StatusCodes.NOT_FOUND,
                `Error: toolsController.importSkill - workspace ${workspaceId} not found!`
            )
        }

        let parsed
        let adapted
        try {
            parsed = parseSkillPackage(file.buffer, file.originalname)
            adapted = adaptSkillToTool(parsed)
        } catch (e) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, `Invalid OpenClaw skill: ${(e as Error).message}`)
        }

        const toolBody: Record<string, unknown> = {
            name: adapted.name,
            description: adapted.description,
            color: randomGradient(),
            iconSrc: adapted.iconSrc,
            schema: adapted.schema,
            func: adapted.func,
            workspaceId
        }

        const apiResponse = await toolsService.createTool(toolBody, orgId)
        return res.json(apiResponse)
    } catch (error) {
        next(error)
    }
}

export default {
    createTool,
    deleteTool,
    getAllTools,
    getToolById,
    updateTool,
    importSkill
}
