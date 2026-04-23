import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddPetFlowId1768100000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "pet" ADD COLUMN IF NOT EXISTS "petFlowId" varchar`)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "pet" DROP COLUMN IF EXISTS "petFlowId"`)
    }
}
