/* eslint-disable */
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity('intent_skill_binding')
@Index(['petId', 'intent'], { unique: true })
export class IntentSkillBinding {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ type: 'varchar' })
    @Index()
    petId: string

    @Column({ type: 'varchar' })
    intent: string

    @Column({ type: 'varchar' })
    skillToolId: string // OpenClaw skill tool ID (Tool entity id)

    @Column({ type: 'varchar', default: 'manual' })
    source: string // 'auto' | 'manual'

    @Column({ type: 'float', nullable: true })
    autoBindScore?: number // cosine similarity score when source='auto'

    @Column({ type: 'int', default: 0 })
    priority: number // higher = tried first when multiple skills match same intent

    @CreateDateColumn({ type: 'timestamp' })
    createdDate: Date

    @UpdateDateColumn({ type: 'timestamp' })
    updatedDate: Date
}
