/* eslint-disable */
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { IPet, IPetAttributes, IPetGrowthCycle } from '../../Interface'

@Entity('pet')
export class Pet implements IPet {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ type: 'varchar' })
    @Index({ unique: true })
    userId: string

    @Column({ type: 'varchar' })
    workspaceId: string

    @Column({ type: 'varchar' })
    name: string

    @Column({ type: 'varchar', default: 'zh' })
    language: string

    @Column({ type: 'timestamp' })
    birthDate: Date

    @Column({ type: 'varchar', nullable: true })
    skinId?: string

    // Stored as JSON string (text) for cross-DB compatibility (sqlite has no json)
    @Column({ type: 'text' })
    attributes: string // serialized IPetAttributes

    @Column({ type: 'text' })
    personalityVector: string // serialized number[]

    @Column({ type: 'text', nullable: true })
    personalityNarrative?: string

    @Column({ type: 'timestamp', nullable: true })
    personalityNarrativeAt?: Date

    @Column({ type: 'int', default: 512 })
    embeddingDimension: number

    @Column({ type: 'text' })
    growthCycle: string // serialized IPetGrowthCycle

    @Column({ type: 'varchar', nullable: true })
    petFlowId?: string // ID of the AgentFlow used for chat

    @CreateDateColumn({ type: 'timestamp' })
    createdDate: Date

    @UpdateDateColumn({ type: 'timestamp' })
    updatedDate: Date
}
