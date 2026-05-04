import cron, { ScheduledTask } from 'node-cron'
import { v4 as uuidv4 } from 'uuid'
import { DataSource } from 'typeorm'
import { ChatFlow } from '../../database/entities/ChatFlow'
import { FlowSchedule, ScheduleStatus } from '../../database/entities/FlowSchedule'
import { Organization } from '../../enterprise/database/entities/organization.entity'
import { Workspace } from '../../enterprise/database/entities/workspace.entity'
import { executeAgentFlow } from '../../utils/buildAgentflow'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import logger from '../../utils/logger'
import { IReactFlowObject } from '../../Interface'

interface IScheduleJob {
    cronTask?: ScheduledTask
    delayTimer?: NodeJS.Timeout
    intervalTimer?: NodeJS.Timeout
}

/** Singleton service that owns all in-process schedule jobs */
export class SchedulerService {
    private static instance: SchedulerService
    private jobs = new Map<string, IScheduleJob>()

    private constructor() {}

    public static getInstance(): SchedulerService {
        if (!SchedulerService.instance) {
            SchedulerService.instance = new SchedulerService()
        }
        return SchedulerService.instance
    }

    // ─── Initialisation ───────────────────────────────────────────────────────

    /** Called once on server startup – loads every active schedule from DB. */
    public async init(dataSource: DataSource): Promise<void> {
        const schedules = await dataSource.getRepository(FlowSchedule).find({
            where: { status: 'active' as ScheduleStatus }
        })
        for (const schedule of schedules) {
            this.registerJob(schedule)
        }
        logger.info(`[SchedulerService] Loaded ${schedules.length} active schedule(s)`)
    }

    // ─── Sync (called from chatflow save / update) ────────────────────────────

    /**
     * Parse flowData for scheduleAgentflow nodes, then upsert FlowSchedule rows
     * and restart the in-process jobs.
     */
    public async syncChatflowSchedules(chatflowId: string, flowData: string, workspaceId: string): Promise<void> {
        const appServer = getRunningExpressApp()
        const repo = appServer.AppDataSource.getRepository(FlowSchedule)

        let nodes: any[] = []
        try {
            const parsed: IReactFlowObject = JSON.parse(flowData)
            nodes = parsed.nodes ?? []
        } catch {
            return
        }

        const scheduleNodes = nodes.filter((n: any) => n.data?.name === 'scheduleAgentflow')

        // Remove jobs for nodes that no longer exist in the flow
        const existingSchedules = await repo.find({ where: { chatflowId } })
        const activeNodeIds = new Set(scheduleNodes.map((n: any) => n.id))
        for (const s of existingSchedules) {
            if (!activeNodeIds.has(s.nodeId)) {
                this.stopJob(s.id)
                await repo.delete(s.id)
            }
        }

        // Upsert each schedule node
        for (const node of scheduleNodes) {
            const inputs = node.data?.inputs ?? {}
            const existing = existingSchedules.find((s) => s.nodeId === node.id)

            const contextParams = inputs.contextParams
                ? typeof inputs.contextParams === 'string'
                    ? inputs.contextParams
                    : JSON.stringify(inputs.contextParams)
                : null

            if (existing) {
                // Update fields from node inputs
                existing.scheduleType = inputs.scheduleType ?? existing.scheduleType
                existing.cronExpression = inputs.cronExpression ?? null
                existing.timezone = inputs.timezone ?? 'UTC'
                existing.delay = inputs.delay ? Number(inputs.delay) : undefined
                existing.initialDelay = inputs.initialDelay ? Number(inputs.initialDelay) : 0
                existing.interval = inputs.interval ? Number(inputs.interval) : undefined
                existing.maxExecutions = inputs.maxExecutions ? Number(inputs.maxExecutions) : 0
                existing.contextParams = contextParams
                existing.status = 'active'
                await repo.save(existing)
                this.stopJob(existing.id)
                this.registerJob(existing)
            } else {
                const schedule = repo.create({
                    id: uuidv4(),
                    chatflowId,
                    nodeId: node.id,
                    name: node.data?.label ?? 'Schedule',
                    scheduleType: inputs.scheduleType ?? 'cron',
                    cronExpression: inputs.cronExpression ?? null,
                    timezone: inputs.timezone ?? 'UTC',
                    delay: inputs.delay ? Number(inputs.delay) : undefined,
                    initialDelay: inputs.initialDelay ? Number(inputs.initialDelay) : 0,
                    interval: inputs.interval ? Number(inputs.interval) : undefined,
                    maxExecutions: inputs.maxExecutions ? Number(inputs.maxExecutions) : 0,
                    contextParams,
                    status: 'active' as ScheduleStatus,
                    executionCount: 0,
                    workspaceId
                })
                await repo.save(schedule)
                this.registerJob(schedule)
            }
        }
    }

    /** Remove all schedules for a deleted chatflow. */
    public async removeChatflowSchedules(chatflowId: string): Promise<void> {
        const appServer = getRunningExpressApp()
        const repo = appServer.AppDataSource.getRepository(FlowSchedule)
        const schedules = await repo.find({ where: { chatflowId } })
        for (const s of schedules) {
            this.stopJob(s.id)
        }
        if (schedules.length > 0) {
            await repo.delete({ chatflowId })
        }
    }

    // ─── Job registration ─────────────────────────────────────────────────────

    private registerJob(schedule: FlowSchedule): void {
        this.stopJob(schedule.id) // idempotent

        const job: IScheduleJob = {}

        switch (schedule.scheduleType) {
            case 'cron': {
                if (!schedule.cronExpression) return
                if (!cron.validate(schedule.cronExpression)) {
                    logger.warn(`[SchedulerService] Invalid cron expression for schedule ${schedule.id}: ${schedule.cronExpression}`)
                    return
                }
                job.cronTask = cron.schedule(schedule.cronExpression, () => this.fire(schedule.id), {
                    timezone: schedule.timezone ?? 'UTC'
                })
                break
            }
            case 'delay': {
                const ms = (schedule.delay ?? 0) * 1000
                if (ms <= 0) return
                job.delayTimer = setTimeout(() => this.fire(schedule.id), ms)
                break
            }
            case 'interval': {
                const intervalMs = (schedule.interval ?? 60) * 1000
                const initialDelayMs = (schedule.initialDelay ?? 0) * 1000
                const start = () => {
                    this.fire(schedule.id)
                    job.intervalTimer = setInterval(() => this.fire(schedule.id), intervalMs)
                }
                if (initialDelayMs > 0) {
                    job.delayTimer = setTimeout(start, initialDelayMs)
                } else {
                    start()
                }
                break
            }
        }

        this.jobs.set(schedule.id, job)
    }

    private stopJob(scheduleId: string): void {
        const job = this.jobs.get(scheduleId)
        if (!job) return
        job.cronTask?.stop()
        if (job.delayTimer) clearTimeout(job.delayTimer)
        if (job.intervalTimer) clearInterval(job.intervalTimer)
        this.jobs.delete(scheduleId)
    }

    // ─── Execution ────────────────────────────────────────────────────────────

    private async fire(scheduleId: string): Promise<void> {
        const appServer = getRunningExpressApp()
        const repo = appServer.AppDataSource.getRepository(FlowSchedule)

        const schedule = await repo.findOneBy({ id: scheduleId })
        if (!schedule || schedule.status !== 'active') return

        // Check max executions limit
        if (schedule.maxExecutions > 0 && schedule.executionCount >= schedule.maxExecutions) {
            schedule.status = 'completed'
            await repo.save(schedule)
            this.stopJob(scheduleId)
            logger.info(`[SchedulerService] Schedule ${scheduleId} completed (maxExecutions reached)`)
            return
        }

        // Increment counter before running so concurrent fires don't double-count
        schedule.executionCount += 1
        schedule.lastExecutedAt = new Date()
        await repo.save(schedule)

        // For one-shot delay jobs, mark completed after firing
        if (schedule.scheduleType === 'delay') {
            schedule.status = 'completed'
            await repo.save(schedule)
            this.jobs.delete(scheduleId)
        }

        try {
            await this.executeFlow(schedule)
        } catch (err) {
            logger.error(`[SchedulerService] Error executing schedule ${scheduleId}:`, err)
            schedule.status = 'error'
            await repo.save(schedule)
            this.stopJob(scheduleId)
        }
    }

    private async executeFlow(schedule: FlowSchedule): Promise<void> {
        const appServer = getRunningExpressApp()
        const { AppDataSource, nodesPool, telemetry, usageCacheManager, cachePool, sseStreamer, identityManager } = appServer

        const chatflow = await AppDataSource.getRepository(ChatFlow).findOneBy({ id: schedule.chatflowId })
        if (!chatflow) {
            logger.warn(`[SchedulerService] Chatflow ${schedule.chatflowId} not found, skipping schedule ${schedule.id}`)
            return
        }

        const workspace = await AppDataSource.getRepository(Workspace).findOneBy({ id: schedule.workspaceId })
        if (!workspace) {
            logger.warn(`[SchedulerService] Workspace ${schedule.workspaceId} not found, skipping schedule ${schedule.id}`)
            return
        }

        const org = await AppDataSource.getRepository(Organization).findOneBy({ id: workspace.organizationId })
        if (!org) {
            logger.warn(`[SchedulerService] Organization not found for workspace ${schedule.workspaceId}`)
            return
        }

        const subscriptionId = org.subscriptionId as string
        const productId = await identityManager.getProductIdFromSubscription(subscriptionId)

        // Build user-defined static params
        const userParams: Record<string, any> = {}
        if (schedule.contextParams) {
            try {
                const arr: Array<{ key: string; value: string }> = JSON.parse(schedule.contextParams)
                for (const p of arr) {
                    if (p.key) userParams[p.key] = p.value
                }
            } catch {
                logger.warn(`[SchedulerService] Error parsing context params for schedule ${schedule.id}: ${schedule.contextParams}`)
            }
        }

        // Build trigger context that the Schedule node will receive as `input`
        const triggerContext = {
            scheduledAt: schedule.lastExecutedAt?.toISOString() ?? new Date().toISOString(),
            executionCount: schedule.executionCount,
            scheduleId: schedule.id,
            scheduleType: schedule.scheduleType,
            cronExpression: schedule.cronExpression ?? '',
            ...userParams
        }

        const chatId = uuidv4()
        const baseURL = process.env.FLOWISE_URL ?? 'http://localhost:3000'

        logger.info(`[SchedulerService] Firing schedule ${schedule.id} (execution #${schedule.executionCount})`)

        await executeAgentFlow({
            componentNodes: nodesPool.componentNodes,
            incomingInput: { question: JSON.stringify(triggerContext) },
            chatflow,
            chatId,
            appDataSource: AppDataSource,
            telemetry,
            usageCacheManager,
            cachePool,
            sseStreamer,
            baseURL,
            isInternal: true,
            signal: new AbortController(),
            orgId: org.id,
            workspaceId: workspace.id,
            subscriptionId,
            productId
        })
    }

    // ─── Public CRUD helpers (used by controller) ─────────────────────────────

    public async pauseSchedule(scheduleId: string): Promise<FlowSchedule> {
        const appServer = getRunningExpressApp()
        const repo = appServer.AppDataSource.getRepository(FlowSchedule)
        const schedule = await repo.findOneByOrFail({ id: scheduleId })
        schedule.status = 'paused'
        this.stopJob(scheduleId)
        return repo.save(schedule)
    }

    public async resumeSchedule(scheduleId: string): Promise<FlowSchedule> {
        const appServer = getRunningExpressApp()
        const repo = appServer.AppDataSource.getRepository(FlowSchedule)
        const schedule = await repo.findOneByOrFail({ id: scheduleId })
        schedule.status = 'active'
        await repo.save(schedule)
        this.registerJob(schedule)
        return schedule
    }

    public async deleteSchedule(scheduleId: string): Promise<void> {
        const appServer = getRunningExpressApp()
        this.stopJob(scheduleId)
        await appServer.AppDataSource.getRepository(FlowSchedule).delete(scheduleId)
    }

    // ─── Agent-created schedules (no canvas Schedule node required) ──────────
    //
    // Schedules with nodeId starting with 'agent-tool:' are created at runtime
    // by tool-calling agents (e.g. Pet calling the `schedule` tool). They reuse
    // the same FlowSchedule table + fire mechanism. Their contextParams carry
    // a `prompt` field that downstream nodes (e.g. Pet) treat as user input.

    public async createAgentSchedule(params: {
        chatflowId: string
        workspaceId: string
        name: string
        scheduleType: 'cron' | 'interval' | 'delay'
        cronExpression?: string
        interval?: number
        delay?: number
        timezone?: string
        prompt: string
        userId: string
        maxExecutions?: number
    }): Promise<FlowSchedule> {
        const appServer = getRunningExpressApp()
        const repo = appServer.AppDataSource.getRepository(FlowSchedule)

        // Validate before persist
        if (params.scheduleType === 'cron') {
            if (!params.cronExpression || !cron.validate(params.cronExpression)) {
                throw new Error(`Invalid cron expression: ${params.cronExpression}`)
            }
        } else if (params.scheduleType === 'interval') {
            if (!params.interval || params.interval < 60) {
                throw new Error('interval must be >= 60 seconds')
            }
        } else if (params.scheduleType === 'delay') {
            if (!params.delay || params.delay <= 0) {
                throw new Error('delay must be > 0 seconds')
            }
        }

        // Per-(chatflow,user) name uniqueness — duplicate name updates the existing one
        const nodeId = `agent-tool:${params.chatflowId}:${params.userId}:${params.name}`
        const existing = await repo.findOne({ where: { chatflowId: params.chatflowId, nodeId } })

        const contextParams = JSON.stringify([
            { key: 'prompt', value: params.prompt },
            { key: 'userId', value: params.userId },
            { key: 'agentCreated', value: '1' }
        ])

        const row = existing ?? new FlowSchedule()
        row.chatflowId = params.chatflowId
        row.workspaceId = params.workspaceId
        row.nodeId = nodeId
        row.name = params.name
        row.scheduleType = params.scheduleType as any
        row.cronExpression = params.cronExpression ?? undefined
        row.interval = params.interval ?? undefined
        row.delay = params.delay ?? undefined
        row.timezone = params.timezone ?? 'UTC'
        row.contextParams = contextParams
        row.status = 'active' as ScheduleStatus
        row.maxExecutions = params.maxExecutions ?? 0
        if (!existing) row.executionCount = 0

        const saved = await repo.save(row)
        if (existing) this.stopJob(saved.id)
        this.registerJob(saved)
        return saved
    }

    public async cancelAgentScheduleByName(params: { chatflowId: string; userId: string; name: string }): Promise<boolean> {
        const appServer = getRunningExpressApp()
        const repo = appServer.AppDataSource.getRepository(FlowSchedule)
        const nodeId = `agent-tool:${params.chatflowId}:${params.userId}:${params.name}`
        const found = await repo.findOne({ where: { chatflowId: params.chatflowId, nodeId } })
        if (!found) return false
        this.stopJob(found.id)
        await repo.delete(found.id)
        return true
    }

    public async listAgentSchedules(params: { chatflowId: string; userId: string }): Promise<FlowSchedule[]> {
        const appServer = getRunningExpressApp()
        const repo = appServer.AppDataSource.getRepository(FlowSchedule)
        const prefix = `agent-tool:${params.chatflowId}:${params.userId}:`
        const all = await repo.find({ where: { chatflowId: params.chatflowId } })
        return all.filter((s) => s.nodeId.startsWith(prefix))
    }
}

export default SchedulerService.getInstance()
