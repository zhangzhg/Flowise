import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddPlugin1769400000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`plugin\` (
                \`id\`          varchar(36) PRIMARY KEY NOT NULL,
                \`name\`        varchar(255) NOT NULL UNIQUE,
                \`displayName\` varchar(255),
                \`description\` text,
                \`version\`     varchar(50),
                \`enabled\`     tinyint(1) NOT NULL DEFAULT 1,
                \`installPath\` text NOT NULL,
                \`i18nPath\`    text,
                \`manifest\`    text,
                \`createdDate\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
                \`updatedDate\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS \`plugin\`;`)
    }
}
