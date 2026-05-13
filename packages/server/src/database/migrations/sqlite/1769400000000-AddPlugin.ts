import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddPlugin1769400000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "plugin" (
                "id"          varchar PRIMARY KEY NOT NULL,
                "name"        varchar NOT NULL UNIQUE,
                "displayName" varchar,
                "description" text,
                "version"     varchar,
                "enabled"     boolean NOT NULL DEFAULT 1,
                "installPath" text NOT NULL,
                "i18nPath"    text,
                "manifest"    text,
                "createdDate" datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate" datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "plugin";`)
    }
}
