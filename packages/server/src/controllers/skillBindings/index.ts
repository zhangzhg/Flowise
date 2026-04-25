import { Request, Response, NextFunction } from 'express'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { IntentSkillBinding } from '../../database/entities/IntentSkillBinding'

const getBindings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { petId } = req.params
        const appServer = getRunningExpressApp()
        const repo = appServer.AppDataSource.getRepository(IntentSkillBinding)
        const bindings = await repo.find({ where: { petId }, order: { priority: 'DESC', createdDate: 'DESC' } })
        res.json(bindings)
    } catch (e) {
        next(e)
    }
}

const createBinding = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { petId } = req.params
        const { intent, skillToolId, priority = 0 } = req.body
        if (!intent || !skillToolId) {
            res.status(400).json({ message: 'intent and skillToolId are required' })
            return
        }
        const appServer = getRunningExpressApp()
        const repo = appServer.AppDataSource.getRepository(IntentSkillBinding)

        const existing = await repo.findOne({ where: { petId, intent } })
        if (existing) {
            res.status(409).json({ message: `Binding for intent "${intent}" already exists` })
            return
        }

        const binding = repo.create({ petId, intent, skillToolId, source: 'manual', priority })
        await repo.save(binding)
        res.status(201).json(binding)
    } catch (e) {
        next(e)
    }
}

const deleteBinding = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { petId, bindingId } = req.params
        const appServer = getRunningExpressApp()
        const repo = appServer.AppDataSource.getRepository(IntentSkillBinding)
        const binding = await repo.findOne({ where: { id: bindingId, petId } })
        if (!binding) {
            res.status(404).json({ message: 'Binding not found' })
            return
        }
        await repo.remove(binding)
        res.json({ message: 'Binding deleted' })
    } catch (e) {
        next(e)
    }
}

export default { getBindings, createBinding, deleteBinding }
