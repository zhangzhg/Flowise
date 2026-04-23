import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddFlowSchedule1769200000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "flow_schedule" (
                "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "chatflowId"     uuid NOT NULL,
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
                "lastExecutedAt" TIMESTAMP WITH TIME ZONE,
                "workspaceId"    text NOT NULL,
                "createdDate"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedDate"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
            );
        `)
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_flow_schedule_chatflowId" ON "flow_schedule" ("chatflowId");`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_flow_schedule_chatflowId";`)
        await queryRunner.query(`DROP TABLE IF EXISTS "flow_schedule";`)
    }
}
