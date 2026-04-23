/* eslint-disable */
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import { ICard } from '../../Interface'

@Entity('pet_card')
@Index(['petId', 'cardType'])
export class Card implements ICard {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ type: 'varchar' })
    petId: string

    @Column({ type: 'varchar' })
    cardType: string // 'vocab' | 'phrase' | 'action'

    @Column({ type: 'text' })
    input: string

    @Column({ type: 'text' })
    output: string

    @Column({ type: 'varchar', nullable: true })
    intentLabel?: string

    @Column({ type: 'text', nullable: true })
    traitTags?: string // serialized string[]

    @Column({ type: 'text', nullable: true })
    stateDelta?: string // serialized { mood?, energy?, hunger?, exp? }

    @Column({ type: 'text' })
    embedding: string // serialized number[]

    @Column({ type: 'varchar', default: 'user' })
    source: string // 'user' | 'library' | 'parser'

    @Column({ type: 'varchar', nullable: true })
    libraryName?: string

    @CreateDateColumn({ type: 'timestamp' })
    createdDate: Date
}
