import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddPetMemory1769500000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS pet_chat_message (
                id              uuid NOT NULL DEFAULT gen_random_uuid(),
                "petId"         character varying NOT NULL,
                "chatId"        character varying NOT NULL,
                role            character varying NOT NULL,
                content         text NOT NULL,
                consolidated    boolean NOT NULL DEFAULT false,
                "createdAt"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_pet_chat_message_id" PRIMARY KEY (id)
            );
        `)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pet_chat_message_petId_chatId" ON pet_chat_message ("petId", "chatId");`)
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_pet_chat_message_petId_consolidated" ON pet_chat_message ("petId", consolidated);`
        )

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS pet_memory (
                id                uuid NOT NULL DEFAULT gen_random_uuid(),
                "petId"           character varying NOT NULL,
                "memoryType"      character varying NOT NULL,
                summary           text NOT NULL,
                embedding         text NOT NULL,
                importance        double precision NOT NULL DEFAULT 1,
                "accessCount"     integer NOT NULL DEFAULT 0,
                "lastAccessedAt"  TIMESTAMP WITH TIME ZONE,
                "consolidatedAt"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_pet_memory_id" PRIMARY KEY (id)
            );
        `)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pet_memory_petId" ON pet_memory ("petId");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pet_memory_petId";`)
        await queryRunner.query(`DROP TABLE IF EXISTS pet_memory;`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pet_chat_message_petId_consolidated";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pet_chat_message_petId_chatId";`)
        await queryRunner.query(`DROP TABLE IF EXISTS pet_chat_message;`)
    }
}
