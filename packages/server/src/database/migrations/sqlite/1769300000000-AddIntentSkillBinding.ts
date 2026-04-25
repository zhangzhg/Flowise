import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddIntentSkillBinding1769300000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "intent_skill_binding" (
                "id"            varchar PRIMARY KEY NOT NULL,
                "petId"         varchar NOT NULL,
                "intent"        varchar NOT NULL,
                "skillToolId"   varchar NOT NULL,
                "source"        varchar NOT NULL DEFAULT 'manual',
                "autoBindScore" real,
                "priority"      integer NOT NULL DEFAULT 0,
                "createdDate"   datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate"   datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_isb_petId_intent" ON "intent_skill_binding" ("petId", "intent");`)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_isb_petId" ON "intent_skill_binding" ("petId");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_isb_petId";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_isb_petId_intent";`)
        await queryRunner.query(`DROP TABLE IF EXISTS "intent_skill_binding";`)
    }
}
