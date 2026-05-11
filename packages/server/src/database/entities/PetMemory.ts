/* eslint-disable */
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

@Entity('pet_memory')
@Index(['petId'])
export class PetMemory {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ type: 'varchar' })
    petId: string

    @Column({ type: 'varchar' }) // 'episode' | 'trait' | 'preference' | 'fact'
    memoryType: string

    @Column({ type: 'text' })
    summary: string

    @Column({ type: 'text' })
    embedding: string // serialized number[]

    @Column({ type: 'float', default: 1.0 })
    importance: number

    @Column({ type: 'int', default: 0 })
    accessCount: number

    @Column({ type: 'timestamp', nullable: true })
    lastAccessedAt?: Date

    @CreateDateColumn({ type: 'timestamp' })
    consolidatedAt: Date
}
