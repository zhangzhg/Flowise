import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddIntentSkillBinding1769300000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`intent_skill_binding\` (
                \`id\`            varchar(36) PRIMARY KEY NOT NULL,
                \`petId\`         varchar(36) NOT NULL,
                \`intent\`        varchar(255) NOT NULL,
                \`skillToolId\`   varchar(36) NOT NULL,
                \`source\`        varchar(20) NOT NULL DEFAULT 'manual',
                \`autoBindScore\` float,
                \`priority\`      int NOT NULL DEFAULT 0,
                \`createdDate\`   datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
                \`updatedDate\`   datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY \`IDX_isb_petId_intent\` (\`petId\`, \`intent\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `)
        await queryRunner.query(`CREATE INDEX \`IDX_isb_petId\` ON \`intent_skill_binding\` (\`petId\`);`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`IDX_isb_petId\` ON \`intent_skill_binding\`;`)
        await queryRunner.query(`DROP TABLE IF EXISTS \`intent_skill_binding\`;`)
    }
}
