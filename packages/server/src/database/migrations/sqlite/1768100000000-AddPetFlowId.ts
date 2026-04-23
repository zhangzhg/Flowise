import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddPetFlowId1768100000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "pet" ADD COLUMN "petFlowId" varchar`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // SQLite does not support DROP COLUMN before 3.35; recreate table if needed
        await queryRunner.query(`CREATE TABLE "pet_backup" AS SELECT * FROM "pet"`)
        await queryRunner.query(`DROP TABLE "pet"`)
        await queryRunner.query(`
            CREATE TABLE "pet" (
                "id" varchar PRIMARY KEY NOT NULL,
                "userId" varchar NOT NULL,
                "workspaceId" varchar NOT NULL,
                "name" varchar NOT NULL,
                "language" varchar NOT NULL DEFAULT 'zh',
                "birthDate" timestamp NOT NULL,
                "skinId" varchar,
                "attributes" text NOT NULL,
                "personalityVector" text NOT NULL,
                "personalityNarrative" text,
                "personalityNarrativeAt" timestamp,
                "embeddingDimension" integer NOT NULL DEFAULT 512,
                "growthCycle" text NOT NULL,
                "createdDate" timestamp NOT NULL DEFAULT (datetime('now')),
                "updatedDate" timestamp NOT NULL DEFAULT (datetime('now'))
            )
        `)
        await queryRunner.query(
            `INSERT INTO "pet" SELECT "id","userId","workspaceId","name","language","birthDate","skinId","attributes","personalityVector","personalityNarrative","personalityNarrativeAt","embeddingDimension","growthCycle","createdDate","updatedDate" FROM "pet_backup"`
        )
        await queryRunner.query(`DROP TABLE "pet_backup"`)
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_pet_userId" ON "pet" ("userId")`)
    }
}
