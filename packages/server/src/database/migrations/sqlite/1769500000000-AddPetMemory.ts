import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddPetMemory1769500000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "pet_chat_message" (
                "id"           varchar PRIMARY KEY NOT NULL,
                "petId"        varchar NOT NULL,
                "chatId"       varchar NOT NULL,
                "role"         varchar NOT NULL,
                "content"      text NOT NULL,
                "consolidated" boolean NOT NULL DEFAULT 0,
                "createdAt"    datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pet_chat_message_petId_chatId" ON "pet_chat_message" ("petId", "chatId");`)
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_pet_chat_message_petId_consolidated" ON "pet_chat_message" ("petId", "consolidated");`
        )

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "pet_memory" (
                "id"             varchar PRIMARY KEY NOT NULL,
                "petId"          varchar NOT NULL,
                "memoryType"     varchar NOT NULL,
                "summary"        text NOT NULL,
                "embedding"      text NOT NULL,
                "importance"     real NOT NULL DEFAULT 1.0,
                "accessCount"    integer NOT NULL DEFAULT 0,
                "lastAccessedAt" datetime,
                "consolidatedAt" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pet_memory_petId" ON "pet_memory" ("petId");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pet_memory_petId";`)
        await queryRunner.query(`DROP TABLE IF EXISTS "pet_memory";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pet_chat_message_petId_consolidated";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pet_chat_message_petId_chatId";`)
        await queryRunner.query(`DROP TABLE IF EXISTS "pet_chat_message";`)
    }
}
