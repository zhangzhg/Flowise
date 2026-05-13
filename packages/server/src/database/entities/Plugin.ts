import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm'

@Entity('plugin')
export class Plugin {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ unique: true })
    name: string

    @Column({ nullable: true })
    displayName?: string

    @Column({ nullable: true, type: 'text' })
    description?: string

    @Column({ nullable: true })
    version?: string

    @Column({ default: true })
    enabled: boolean

    @Column({ type: 'text' })
    installPath: string

    @Column({ nullable: true, type: 'text' })
    i18nPath?: string

    @Column({ nullable: true, type: 'text' })
    manifest?: string

    @Column({ type: 'timestamp' })
    @CreateDateColumn()
    createdDate: Date

    @Column({ type: 'timestamp' })
    @UpdateDateColumn()
    updatedDate: Date
}
