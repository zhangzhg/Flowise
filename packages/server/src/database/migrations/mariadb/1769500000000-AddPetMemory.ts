import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddPetMemory1769500000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`pet_chat_message\` (
                \`id\`           varchar(36) NOT NULL,
                \`petId\`        varchar(255) NOT NULL,
                \`chatId\`       varchar(255) NOT NULL,
                \`role\`         varchar(20) NOT NULL,
                \`content\`      text NOT NULL,
                \`consolidated\` tinyint(1) NOT NULL DEFAULT 0,
                \`createdAt\`    datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`),
                KEY \`IDX_pet_chat_message_petId_chatId\` (\`petId\`, \`chatId\`),
                KEY \`IDX_pet_chat_message_petId_consolidated\` (\`petId\`, \`consolidated\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `)

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`pet_memory\` (
                \`id\`             varchar(36) NOT NULL,
                \`petId\`          varchar(255) NOT NULL,
                \`memoryType\`     varchar(50) NOT NULL,
                \`summary\`        text NOT NULL,
                \`embedding\`      longtext NOT NULL,
                \`importance\`     float NOT NULL DEFAULT 1,
                \`accessCount\`    int NOT NULL DEFAULT 0,
                \`lastAccessedAt\` datetime(6),
                \`consolidatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                PRIMARY KEY (\`id\`),
                KEY \`IDX_pet_memory_petId\` (\`petId\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS \`pet_memory\`;`)
        await queryRunner.query(`DROP TABLE IF EXISTS \`pet_chat_message\`;`)
    }
}
