import { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { FlowSchedule } from '../../database/entities/FlowSchedule'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import schedulerService from '../../services/schedules'

const getSchedules = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = req.user?.activeWorkspaceId
        const { chatflowId } = req.query

        const appServer = getRunningExpressApp()
        const repo = appServer.AppDataSource.getRepository(FlowSchedule)

        const where: any = { workspaceId }
        if (chatflowId) where.chatflowId = chatflowId as string

        const schedules = await repo.find({ where, order: { createdDate: 'DESC' } })
        return res.json(schedules)
    } catch (error) {
        next(error)
    }
}

const getScheduleById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = req.user?.activeWorkspaceId
        const appServer = getRunningExpressApp()
        const schedule = await appServer.AppDataSource.getRepository(FlowSchedule).findOneBy({
            id: req.params.id,
            workspaceId
        })
        if (!schedule) throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Schedule ${req.params.id} not found`)
        return res.json(schedule)
    } catch (error) {
        next(error)
    }
}

const pauseSchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = req.user?.activeWorkspaceId
        const appServer = getRunningExpressApp()
        const schedule = await appServer.AppDataSource.getRepository(FlowSchedule).findOneBy({
            id: req.params.id,
            workspaceId
        })
        if (!schedule) throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Schedule ${req.params.id} not found`)
        const updated = await schedulerService.pauseSchedule(req.params.id)
        return res.json(updated)
    } catch (error) {
        next(error)
    }
}

const resumeSchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = req.user?.activeWorkspaceId
        const appServer = getRunningExpressApp()
        const schedule = await appServer.AppDataSource.getRepository(FlowSchedule).findOneBy({
            id: req.params.id,
            workspaceId
        })
        if (!schedule) throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Schedule ${req.params.id} not found`)
        const updated = await schedulerService.resumeSchedule(req.params.id)
        return res.json(updated)
    } catch (error) {
        next(error)
    }
}

const deleteSchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const workspaceId = req.user?.activeWorkspaceId
        const appServer = getRunningExpressApp()
        const schedule = await appServer.AppDataSource.getRepository(FlowSchedule).findOneBy({
            id: req.params.id,
            workspaceId
        })
        if (!schedule) throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Schedule ${req.params.id} not found`)
        await schedulerService.deleteSchedule(req.params.id)
        return res.json({ message: 'Schedule deleted' })
    } catch (error) {
        next(error)
    }
}

export default { getSchedules, getScheduleById, pauseSchedule, resumeSchedule, deleteSchedule }
