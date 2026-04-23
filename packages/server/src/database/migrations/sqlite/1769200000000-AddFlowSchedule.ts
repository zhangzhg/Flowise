import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddFlowSchedule1769200000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "flow_schedule" (
                "id"             varchar PRIMARY KEY NOT NULL,
                "chatflowId"     varchar NOT NULL,
                "nodeId"         varchar NOT NULL,
                "name"           varchar NOT NULL DEFAULT 'Schedule',
                "scheduleType"   varchar NOT NULL,
                "cronExpression" text,
                "timezone"       varchar DEFAULT 'UTC',
                "delay"          integer,
                "initialDelay"   integer DEFAULT 0,
                "interval"       integer,
                "maxExecutions"  integer NOT NULL DEFAULT 0,
                "contextParams"  text,
                "status"         varchar NOT NULL DEFAULT 'active',
                "executionCount" integer NOT NULL DEFAULT 0,
                "lastExecutedAt" datetime,
                "workspaceId"    text NOT NULL,
                "createdDate"    datetime NOT NULL DEFAULT (datetime('now')),
                "updatedDate"    datetime NOT NULL DEFAULT (datetime('now'))
            );
        `)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_flow_schedule_chatflowId" ON "flow_schedule" ("chatflowId");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_flow_schedule_chatflowId";`)
        await queryRunner.query(`DROP TABLE IF EXISTS "flow_schedule";`)
    }
}
