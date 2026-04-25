import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddIntentSkillBinding1769300000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "intent_skill_binding" (
                "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "petId"         uuid NOT NULL,
                "intent"        varchar NOT NULL,
                "skillToolId"   uuid NOT NULL,
                "source"        varchar NOT NULL DEFAULT 'manual',
                "autoBindScore" float,
                "priority"      integer NOT NULL DEFAULT 0,
                "createdDate"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedDate"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
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
