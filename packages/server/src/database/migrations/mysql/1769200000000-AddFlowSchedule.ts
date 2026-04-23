import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddFlowSchedule1769200000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`flow_schedule\` (
                \`id\`             varchar(36) PRIMARY KEY NOT NULL,
                \`chatflowId\`     varchar(36) NOT NULL,
                \`nodeId\`         varchar(255) NOT NULL,
                \`name\`           varchar(255) NOT NULL DEFAULT 'Schedule',
                \`scheduleType\`   varchar(50) NOT NULL,
                \`cronExpression\` text,
                \`timezone\`       varchar(100) DEFAULT 'UTC',
                \`delay\`          int,
                \`initialDelay\`   int DEFAULT 0,
                \`interval\`       int,
                \`maxExecutions\`  int NOT NULL DEFAULT 0,
                \`contextParams\`  text,
                \`status\`         varchar(20) NOT NULL DEFAULT 'active',
                \`executionCount\` int NOT NULL DEFAULT 0,
                \`lastExecutedAt\` datetime,
                \`workspaceId\`    text NOT NULL,
                \`createdDate\`    datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
                \`updatedDate\`    datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `)
        await queryRunner.query(`CREATE INDEX \`IDX_flow_schedule_chatflowId\` ON \`flow_schedule\` (\`chatflowId\`);`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`IDX_flow_schedule_chatflowId\` ON \`flow_schedule\`;`)
        await queryRunner.query(`DROP TABLE IF EXISTS \`flow_schedule\`;`)
    }
}
