import { Entity, Column, Index, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm'

export type ScheduleType = 'delay' | 'interval' | 'cron'
export type ScheduleStatus = 'active' | 'paused' | 'completed' | 'error'

@Entity()
export class FlowSchedule {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Index()
    @Column({ type: 'uuid' })
    chatflowId: string

    /** The id of the scheduleAgentflow node inside the flow graph */
    @Column({ type: 'varchar' })
    nodeId: string

    @Column({ type: 'varchar', default: 'Schedule' })
    name: string

    @Column({ type: 'varchar' })
    scheduleType: ScheduleType

    /** Cron expression (cron type only) */
    @Column({ nullable: true, type: 'text' })
    cronExpression?: string

    /** Timezone for cron execution */
    @Column({ nullable: true, type: 'varchar', default: 'UTC' })
    timezone?: string

    /** One-shot delay in seconds (delay type) */
    @Column({ nullable: true, type: 'integer' })
    delay?: number

    /** Initial delay before first execution in seconds (interval type) */
    @Column({ nullable: true, type: 'integer', default: 0 })
    initialDelay?: number

    /** Repeat interval in seconds (interval type) */
    @Column({ nullable: true, type: 'integer' })
    interval?: number

    /** 0 = unlimited */
    @Column({ type: 'integer', default: 0 })
    maxExecutions: number

    /** JSON array of { key, value } pairs passed as trigger context */
    @Column({ nullable: true, type: 'text' })
    contextParams?: string

    @Column({ type: 'varchar', default: 'active' })
    status: ScheduleStatus

    @Column({ type: 'integer', default: 0 })
    executionCount: number

    @Column({ nullable: true, type: 'timestamp' })
    lastExecutedAt?: Date

    @Column({ nullable: false, type: 'text' })
    workspaceId: string

    @CreateDateColumn()
    createdDate: Date

    @UpdateDateColumn()
    updatedDate: Date
}
