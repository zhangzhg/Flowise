import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddPlugin1769400000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "plugin" (
                "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "name"        varchar NOT NULL UNIQUE,
                "displayName" varchar,
                "description" text,
                "version"     varchar,
                "enabled"     boolean NOT NULL DEFAULT true,
                "installPath" text NOT NULL,
                "i18nPath"    text,
                "manifest"    text,
                "createdDate" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedDate" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
            );
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "plugin";`)
    }
}
