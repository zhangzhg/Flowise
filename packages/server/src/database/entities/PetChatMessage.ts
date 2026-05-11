/* eslint-disable */
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

@Entity('pet_chat_message')
@Index(['petId', 'chatId'])
@Index(['petId', 'consolidated'])
export class PetChatMessage {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ type: 'varchar' })
    petId: string

    @Column({ type: 'varchar' })
    chatId: string

    @Column({ type: 'varchar' }) // 'user' | 'assistant'
    role: string

    @Column({ type: 'text' })
    content: string

    @Column({ type: 'boolean', default: false })
    consolidated: boolean

    @CreateDateColumn({ type: 'timestamp' })
    createdAt: Date
}
