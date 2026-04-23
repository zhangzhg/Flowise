import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddPetAndCard1768000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "pet" (
                "id" varchar PRIMARY KEY NOT NULL,
                "userId" varchar NOT NULL,
                "workspaceId" varchar NOT NULL,
                "name" varchar NOT NULL,
                "language" varchar NOT NULL DEFAULT 'zh',
                "birthDate" datetime NOT NULL,
                "skinId" varchar,
                "attributes" text NOT NULL,
                "personalityVector" text NOT NULL,
                "personalityNarrative" text,
                "personalityNarrativeAt" datetime,
                "embeddingDimension" integer NOT NULL DEFAULT 512,
                "growthCycle" text NOT NULL,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now'))
            );`
        )
        await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_pet_userId" ON "pet" ("userId");`)

        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS "pet_card" (
                "id" varchar PRIMARY KEY NOT NULL,
                "petId" varchar NOT NULL,
                "cardType" varchar NOT NULL,
                "input" text NOT NULL,
                "output" text NOT NULL,
                "intentLabel" varchar,
                "traitTags" text,
                "stateDelta" text,
                "embedding" text NOT NULL,
                "source" varchar NOT NULL DEFAULT 'user',
                "libraryName" varchar,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now'))
            );`
        )
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pet_card_petId_cardType" ON "pet_card" ("petId", "cardType");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pet_card_petId_cardType";`)
        await queryRunner.query(`DROP TABLE IF EXISTS "pet_card";`)
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pet_userId";`)
        await queryRunner.query(`DROP TABLE IF EXISTS "pet";`)
    }
}
