import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddPetAndCard1768000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS \`pet\` (
                \`id\` varchar(36) NOT NULL,
                \`userId\` varchar(255) NOT NULL,
                \`workspaceId\` varchar(255) NOT NULL,
                \`name\` varchar(255) NOT NULL,
                \`language\` varchar(20) NOT NULL DEFAULT 'zh',
                \`birthDate\` datetime(6) NOT NULL,
                \`skinId\` varchar(36),
                \`attributes\` text NOT NULL,
                \`personalityVector\` text NOT NULL,
                \`personalityNarrative\` text,
                \`personalityNarrativeAt\` datetime(6),
                \`embeddingDimension\` int NOT NULL DEFAULT 512,
                \`growthCycle\` text NOT NULL,
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                \`updatedDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`),
                UNIQUE KEY \`IDX_pet_userId\` (\`userId\`)
              ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;`
        )

        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS \`pet_card\` (
                \`id\` varchar(36) NOT NULL,
                \`petId\` varchar(36) NOT NULL,
                \`cardType\` varchar(20) NOT NULL,
                \`input\` text NOT NULL,
                \`output\` text NOT NULL,
                \`intentLabel\` varchar(255),
                \`traitTags\` text,
                \`stateDelta\` text,
                \`embedding\` longtext NOT NULL,
                \`source\` varchar(20) NOT NULL DEFAULT 'user',
                \`libraryName\` varchar(255),
                \`createdDate\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`),
                KEY \`IDX_pet_card_petId_cardType\` (\`petId\`, \`cardType\`)
              ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;`
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS \`pet_card\`;`)
        await queryRunner.query(`DROP TABLE IF EXISTS \`pet\`;`)
    }
}
