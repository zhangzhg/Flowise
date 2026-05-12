# Pet Agent System — 详细设计文档

**版本** v1.5 · **状态** 持续开发 · **项目** Flowise 扩展 · **最后更新** 2026-05-11

> v1.1 相对 v1.0 的关键变更：**全面节点化**。Provider 不再是后端服务单例，而是 Flowise 画布上的节点；Pet 业务逻辑拆成一组自定义节点，可自由拼装；同时保留 `PetCore` 聚合节点给"零配置党"。

---

## 目录

-   [0. 阅读导引](#0-阅读导引)
-   [1. 背景与目标](#1-背景与目标)
-   [2. 术语表](#2-术语表)
-   [3. 系统总览](#3-系统总览)
-   [4. 数据模型](#4-数据模型)
-   [5. 核心领域模型](#5-核心领域模型)
-   [6. 教学系统](#6-教学系统)
-   [7. 能力系统（技能）](#7-能力系统技能)
-   [8. 节点化架构](#8-节点化架构)
-   [9. AgentFlow 节点目录](#9-agentflow-节点目录)
-   [10. 主链拓扑](#10-主链拓扑)
-   [11. 后台任务](#11-后台任务)
-   [12. REST API](#12-rest-api)
-   [13. UI 设计](#13-ui-设计)
-   [14. 实施阶段计划](#14-实施阶段计划)
-   [15. 非功能需求](#15-非功能需求)
-   [16. 风险与开放问题](#16-风险与开放问题)
-   [17. 附录](#17-附录)
-   [18. 已实施功能详细设计](#18-已实施功能详细设计)
-   [19. 基于 Agentflow 的 Pet 智能体化改造（Phase 7+）](#19-基于-agentflow-的-pet-智能体化改造phase-7)

---

## 0. 阅读导引

本文档按"先建概念、再建模型、后排工序"组织。只看交付节奏跳到 §14；看落地细节从 §4 顺序读；看架构决策重点看 §8。

---

## 1. 背景与目标

### 1.1 背景

在 Flowise 上构建一只"有成长记忆的 AI 宠物"：从完全白纸出生，通过用户喂食**卡片**学习词汇/动作/风格，逐步涌现个性；达到一定程度后自动匹配并装配技能，最终成长为带独立人格、可调用工具、具备皮肤与语音的智能体。

### 1.2 核心目标

-   **G1 零基础成长**：新宠物除原始声外不会任何词；每一句话背后必有某张卡作为源头
-   **G2 可解释的个性**：个性 = 向量（实时）+ 叙事（周期）
-   **G3 能力动态扩展**：复用 OpenClaw skill 包，等级/个性达标后自动装配
-   **G4 低成本**：embedding 走本地 bge-small-zh HTTP 服务（用户自部署），LLM 走 GLM-4-flash
-   **G5 全节点化**：所有业务和 provider 都是 Flowise 节点，AgentFlow 可视化组合
-   **G6 多模态**：可选挂语音输入/输出节点

### 1.3 非目标（MVP 范围外）

-   宠物之间互动/社交
-   长期对话记忆之外的 RAG 文档导入
-   商店/充值/养成竞赛
-   视觉生成（头像用预置 sprite）

---

## 2. 术语表

| 术语                      | 定义                                                |
| ------------------------- | --------------------------------------------------- |
| **Pet**                   | 一只宠物实例，1:1 绑定一个用户                      |
| **Card**                  | 一条训练数据，分 `vocab`/`phrase`/`action` 三型     |
| **Stage**                 | 成长阶段，由卡片数派生：egg→babble→echo→talk→mature |
| **Trait**                 | 单条性格维度（8 维之一）                            |
| **Personality Vector**    | 8 维实时向量，卡片增量累加                          |
| **Personality Narrative** | LLM 周期总结的自然语言人设                          |
| **Skill**                 | OpenClaw 格式的动态工具包，带 `personalityProfile`  |
| **Intent**                | 输入的语义意图标签（如 `greet`/`play`/`teach`）     |
| **Skin**                  | 皮肤配置：头像/色调/音色                            |
| **Tick**                  | 后台时间流逝事件（饥饿/精力衰减）                   |

---

## 3. 系统总览

### 3.1 总架构图

```
┌────────────────────────────────────────────────────────────────┐
│                     UI Layer (React)                            │
│  PetPage · CreatePetDialog · FeedCardDialog · Timeline · etc.   │
└────────────────────────────────────────────────────────────────┘
                          │ REST /api/v1/pet/*
                          ▼
┌────────────────────────────────────────────────────────────────┐
│              Pet Service & Controllers & Cron                   │
│   CRUD · Card Ingest · Library Import · Tick · AutoBind         │
└────────────────────────────────────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
  ┌───────────┐   ┌──────────────┐   ┌──────────────────────┐
  │ Entities  │   │ AgentFlow    │   │ Existing OpenClaw    │
  │ (TypeORM) │   │   Nodes      │   │   Skill System       │
  └───────────┘   └──────────────┘   └──────────────────────┘
                          │
      ┌───────────────────┼───────────────────┐
      ▼                   ▼                   ▼
   Pet 业务节点         Provider 节点       Voice 节点
   (PetCore/           (BgeSmallZh/         (Whisper/
    Matcher/            ChatGLM/              OpenAITTS...)
    Ingestor/           CustomHttp...)
    Responder...)
```

### 3.2 模块职责速览

| 模块           | 职责                                  | 关键目录                                                         |
| -------------- | ------------------------------------- | ---------------------------------------------------------------- |
| Entities       | 持久化 Pet/Card/Binding/Skin/EventLog | `packages/server/src/database/entities/Pet*.ts`                  |
| Services       | 业务：CRUD、卡片吸收、个性聚合        | `packages/server/src/services/pet/`                              |
| Pet Nodes      | 宠物业务节点                          | `packages/components/nodes/pet/`                                 |
| Provider Nodes | Embedding/LLM/Voice 节点              | `packages/components/nodes/embeddings/`, `chatmodels/`, `voice/` |
| Cron           | 定时：Tick/Personality/SkillBind      | `packages/server/src/utils/pet/cron/`                            |
| UI             | 宠物相关前端视图                      | `packages/ui/src/views/pet/`                                     |

---

## 4. 数据模型

### 4.1 实体关系

```
User ──1:1──► Pet ──1:N──► Card
                │
                ├─1:N──► IntentSkillBinding ──N:1──► Tool(OpenClaw)
                ├─1:N──► EventLog
                └─N:1──► Skin
```

### 4.2 Pet 实体

```ts
@Entity()
class Pet {
    @PrimaryGeneratedColumn('uuid') id: string
    @Column({ unique: true }) userId: string // 1:1
    @Column() workspaceId: string
    @Column() name: string
    @Column({ default: 'zh' }) language: 'zh' | 'en' | 'mixed'
    @Column() birthDate: Date
    @Column({ nullable: true }) skinId?: string

    @Column({ type: 'json' }) attributes: {
        mood: number
        hunger: number
        energy: number
        level: number
        exp: number
        cardCount: number
    }

    @Column({ type: 'json' }) personalityVector: number[] // 8 维
    @Column({ type: 'text', nullable: true }) personalityNarrative?: string
    @Column({ type: 'timestamp', nullable: true }) personalityNarrativeAt?: Date

    // 注意：embedding/LLM provider 已改为节点层面解决，
    // 这里只记录维度，用于检测换 provider 后的重嵌需求
    @Column({ default: 512 }) embeddingDimension: number

    @Column({ type: 'json' }) growthCycle: {
        cardsThreshold: number
        hoursThreshold: number
    }

    @CreateDateColumn() createdDate: Date
    @UpdateDateColumn() updatedDate: Date
}
```

### 4.3 Card 实体

```ts
@Entity()
@Index(['petId', 'cardType'])
class Card {
    @PrimaryGeneratedColumn('uuid') id: string
    @Column() petId: string

    @Column() cardType: 'vocab' | 'phrase' | 'action'
    @Column({ type: 'text' }) input: string
    @Column({ type: 'text' }) output: string

    @Column({ nullable: true }) intentLabel?: string
    @Column({ type: 'json', nullable: true }) traitTags?: string[]
    @Column({ type: 'json', nullable: true }) stateDelta?: {
        mood?: number
        energy?: number
        hunger?: number
        exp?: number
    }

    @Column({ type: 'json' }) embedding: number[]
    @Column({ default: 'user' }) source: 'user' | 'library' | 'parser'
    @Column({ nullable: true }) libraryName?: string

    @CreateDateColumn() createdDate: Date
}
```

### 4.4 IntentSkillBinding 实体

```ts
@Entity()
class IntentSkillBinding {
    @PrimaryGeneratedColumn('uuid') id: string
    @Column() petId: string
    @Column() intent: string
    @Column() skillToolId: string // FK → Tool.id
    @Column({ default: 'manual' }) source: 'manual' | 'auto'
    @Column({ type: 'float', nullable: true }) autoBindScore?: number
    @Column({ default: 0 }) priority: number
    @CreateDateColumn() createdDate: Date
}
```

### 4.5 EventLog 实体

```ts
@Entity()
@Index(['petId', 'createdDate'])
class EventLog {
    @PrimaryGeneratedColumn('uuid') id: string
    @Column() petId: string
    @Column() eventType: string
    @Column({ type: 'json' }) payload: any
    @CreateDateColumn() createdDate: Date
}
```

### 4.6 Skin 实体（Phase 4）

```ts
@Entity()
class Skin {
    @PrimaryGeneratedColumn('uuid') id: string
    @Column() name: string
    @Column() avatarUrl: string
    @Column({ nullable: true }) accentColor?: string
    @Column({ type: 'json', nullable: true }) voiceProfile?: {
        voiceId: string
        rate?: number
        pitch?: number
    }
    @Column({ type: 'json', nullable: true }) animations?: Record<string, string>
}
```

---

## 5. 核心领域模型

### 5.1 成长阶段

成长进度由**双轴**驱动：`progress = cardCount × 2 + chatTurns`

| Stage         | progress 阈值 | 输出策略                                      | 可解锁能力          |
| ------------- | ------------- | --------------------------------------------- | ------------------- |
| **egg 🥚**    | 0–1           | 预设原始音随机（`.../?/~/咕`）                | 仅"学习"指令        |
| **babble 🐣** | 2–39          | RAG top-1 cosine>0.8 直出，否则原始音         | 学习、简单回应      |
| **echo 👶**   | 40–199        | 小 LLM + 词汇白名单 prompt + top-5 few-shot   | 以上 + intent 识别  |
| **talk 🧒**   | 200–499       | 完整 LLM + personalityNarrative system prompt | 以上 + manual skill |
| **mature 🧑** | ≥500          | 完整 LLM，高温度，personality 主导 + 工具调用 | 全部 + 自动 skill   |

```ts
// packages/components/nodes/agentflow/Pet/stage.ts
export function deriveProgress(cardCount: number, chatTurns: number): number {
    return Math.floor(cardCount * 2 + chatTurns)
}
export function deriveStage(cardCount: number, chatTurns: number = 0): PetStage
```

**设计理由**：纯卡片驱动会让高频对话用户进展过慢；双轴确保"积极训练 + 积极对话"都能推动成长，同时保留卡片 2× 权重体现"主动教学"的重要性。

### 5.2 Trait 向量（8 维）

| 索引 | 负向 ← 正向   | 含义      |
| ---- | ------------- | --------- |
| 0    | 活泼 ← → 沉稳 | 能量/节奏 |
| 1    | 好奇 ← → 谨慎 | 探索意愿  |
| 2    | 温和 ← → 直接 | 沟通风格  |
| 3    | 创意 ← → 务实 | 思维偏好  |
| 4    | 外向 ← → 内省 | 社交倾向  |
| 5    | 玩心 ← → 严肃 | 幽默感    |
| 6    | 共情 ← → 理性 | 情感取向  |
| 7    | 顺从 ← → 主见 | 自主性    |

**累加规则**：每次 CardIngestor → `vec += sum(tagVectors) * weight(cardType)` → L2 归一化。每 50 张卡重新从 0 算一次（防噪声放大）。

### 5.3 Personality 双轨

| 路径         | 何时更新                    | 用途                        |
| ------------ | --------------------------- | --------------------------- |
| **(a) 向量** | CardIngestor 即时累加       | 技能匹配、快速风格线索      |
| **(b) 叙事** | 满足 `growthCycle` 其一触发 | LLM system prompt、用户可读 |

叙事生成 prompt：

```
根据这只宠物最近 N 张卡片和事件，用 200 字以内中文描述它的性格特点。
性格向量参考：{vector}
卡片样本：{topCards}
最近事件：{recentEvents}
请只输出性格描述，不要分点。
```

### 5.4 属性 Attributes

| 属性     | 范围      | 变化源                                         |
| -------- | --------- | ---------------------------------------------- |
| `mood`   | -100\~100 | 卡片 stateDelta、响应情感、长期饥饿惩罚        |
| `hunger` | 0\~100    | Tick +1/10min，吃 vocab 卡 -5，喂卡 -10        |
| `energy` | 0\~100    | Tick -1/10min，chat -0.5，睡觉 intent 重置 100 |
| `level`  | 1\~∞      | `level = floor(sqrt(exp/100))`                 |
| `exp`    | 0\~∞      | 每张卡 +10，有效对话 +1                        |

---

## 6. 教学系统

### 6.1 卡片三型

| Type       | input | output    | 典型 traitTags | 典型用法                      |
| ---------- | ----- | --------- | -------------- | ----------------------------- |
| **vocab**  | 词    | 词        | 弱倾向         | `跟我读:你好`                 |
| **phrase** | 句式  | 回应      | 中倾向         | `跟我学:看到妈妈说"妈妈你好"` |
| **action** | 情境  | intent 名 | 强倾向         | `教你做:听到"玩"就 play`      |

### 6.2 TeachingParser

**两级解析**：

1. **正则**（覆盖 90%，中英双套）：
    ```
    跟我读:(.+)                           → vocab
    跟我学:(.+?)[说回]["""](.+)["""]     → phrase
    记住:(.+)=>(.+)                        → phrase
    教你做:(.+?)就(.+)                    → action
    repeat after me:(.+)                  → vocab
    learn:\s*say\s*"(.+?)"\s*when\s*(.+)  → phrase
    ```
2. **LLM 兜底**（正则不匹配时）：
    ```
    你是一个教学解析器。用户正在教一只 AI 宠物说话。
    请解析输入为 JSON：
    { "cardType": "vocab|phrase|action",
      "input": "…", "output": "…",
      "traitTags": [...] }
    解析失败返回 { "cardType": null }。
    输入：{text}
    ```

### 6.3 CardLibrary 启蒙包

**`library.json`** **格式**：

```json
{
    "name": "中文启蒙包",
    "version": "1.0.0",
    "language": "zh",
    "description": "100 词 + 30 行动",
    "cards": [
        { "cardType": "vocab", "input": "妈妈", "output": "妈妈", "traitTags": ["affectionate"] },
        {
            "cardType": "action",
            "input": "陪我玩",
            "output": "play",
            "intentLabel": "play",
            "traitTags": ["playful"],
            "stateDelta": { "mood": 5, "energy": -2 }
        }
    ]
}
```

**内置三包** `packages/server/marketplaces/petstarters/`：

-   `starter-zh.json`（默认）
-   `starter-en.json`
-   `starter-bilingual.json`

### 6.4 向量检索

-   每张 Card 写入时对 `input` 做 embedding
-   检索：输入 → embedding → cosine → top-K
-   **分型检索**：action 卡优先（用于 intent 路由），vocab/phrase 合并
-   **Cache**：Pet 级 LRU 100 条

---

## 7. 能力系统（技能）

### 7.1 技能 = OpenClaw Tool

完全复用已实现的 OpenClaw skill 系统（见 [packages/server/src/utils/openclawSkill/](../packages/server/src/utils/openclawSkill/)）。

### 7.2 manifest 扩展

在 [`types.ts`](../packages/server/src/utils/openclawSkill/types.ts) 加 3 个可选字段：

```ts
interface OpenClawManifest {
    // 已有字段...
    personalityProfile?: number[] // 8 维
    minLevel?: number
    boundIntents?: string[]
}
```

### 7.3 自动解锁算法

**触发**：每小时 cron + 宠物升级事件。

```ts
for (const skill of workspaceSkills where skill.personalityProfile) {
    if (pet.level < skill.minLevel) continue
    if (alreadyBound(pet.id, skill.id)) continue
    const score = cosineSim(pet.personalityVector, skill.personalityProfile)
    if (score > PET_AUTO_BIND_THRESHOLD) {   // 默认 0.7
        bind(pet.id, skill.boundIntents[0], skill.id, 'auto', score)
        logEvent('skill_unlock', { skillId, score })
    }
}
```

### 7.4 意图-技能绑定

`IntentSkillBinding`，`(petId, intent)` 唯一。优先 `priority` 高的。

---

## 8. 节点化架构

**核心理念**：不要重复造 provider 抽象——Flowise 的节点系统本身就是最强大的 provider 抽象。

### 8.1 三层节点分类

```
┌──────────────────────────────────────────────────────────┐
│                 Pet 业务节点 (packages/components/       │
│                   nodes/pet/)                             │
│                                                           │
│   PetCore · PetStateLoader · CardMatcher · CardIngestor  │
│   TeachingParser · VocabularyResponder · PetStateSaver   │
│   SkillRouter · SkinDecorator · PersonalityRefresher     │
│                                                           │
│   这些节点"消费" Provider 节点作为输入                       │
└──────────────────────────────────────────────────────────┘
                ▲                           ▲
                │                           │
┌───────────────┴──────────┐   ┌────────────┴─────────────┐
│   Provider 节点 (已有 +   │   │     Voice 节点           │
│   新增)                   │   │     (新增 Phase 5)       │
│                           │   │                          │
│   Embeddings:             │   │   Transcriber:           │
│   - BgeSmallZhEmbeddings  │   │   - WhisperSTT           │
│   - CustomHttpEmbeddings  │   │   - AliyunSTT            │
│   - (Flowise 已有其他)    │   │   - BrowserWebSpeech     │
│                           │   │                          │
│   ChatModels:             │   │   Synthesizer:           │
│   - ChatGLM               │   │   - OpenAITTS            │
│   - (Flowise 已有其他)    │   │   - AliyunTTS            │
└───────────────────────────┘   └──────────────────────────┘
```

### 8.2 Provider 节点规格（Phase 0 交付）

#### `BgeSmallZhEmbeddings`

**位置**：`packages/components/nodes/embeddings/BgeSmallZh/`

**说明**：调用用户自部署的 bge-small-zh HTTP 服务，继承 `@langchain/core/embeddings` 的 `Embeddings` 基类。

**输入参数**：

| 字段        | 类型   | 说明                                   |
| ----------- | ------ | -------------------------------------- |
| `endpoint`  | string | 默认读 env `BGE_EMBEDDING_URL`，可覆盖 |
| `batchSize` | number | 默认 32                                |
| `timeout`   | number | 默认 30s                               |

**请求/响应约定**（与 HuggingFace TEI 或自建 FastAPI 服务对齐）：

```
POST {endpoint}/embed
Body: { "inputs": ["text1", "text2"] }
Response: [[0.1, 0.2, ...], [...]]
```

**输出 baseClass**：`Embeddings`

#### `CustomHttpEmbeddings`

**位置**：`packages/components/nodes/embeddings/CustomHttp/`

**说明**：通用 HTTP embedding 节点，用户指定 URL 格式 / 请求体模板 / 响应路径。

**输入参数**：

| 字段               | 类型         | 说明                        |
| ------------------ | ------------ | --------------------------- |
| `endpoint`         | string       | 完整 URL                    |
| `method`           | 'POST'/'GET' | 默认 POST                   |
| `headers`          | JSON         | 可选                        |
| `requestTemplate`  | string       | 例 `{"input": "${text}"}`   |
| `responseJsonPath` | string       | 例 `data.embedding`         |
| `dimension`        | number       | 维度（重要，用于 Pet 写入） |
| `batchSize`        | number       | <br />                      |

#### `ChatGLM`

**位置**：`packages/components/nodes/chatmodels/ChatGLM/`

**说明**：GLM-4-flash 默认 chat model。两种实现路径：

-   **路径 A（推荐）**：扩展现有 `ChatOpenAI` 节点 preset，`baseURL=https://open.bigmodel.cn/api/paas/v4`, `model=glm-4-flash`
-   **路径 B**：直接用 `@langchain/openai` 的 `ChatOpenAI` 配 baseURL

**输入参数**：

| 字段          | 类型       | 默认          |
| ------------- | ---------- | ------------- |
| `apiKey`      | Credential | -             |
| `model`       | string     | `glm-4-flash` |
| `temperature` | number     | 0.7           |
| `maxTokens`   | number     | 2048          |

**Credential**：新增 `credentialName = glmApi`（有 `apiKey` + `baseURL`）

### 8.3 Pet 业务节点与 Provider 的对接

每个 Pet 业务节点都把 `Embeddings` / `BaseChatModel` 声明为 **input 参数**（`type: 'BaseChatModel'` / `type: 'Embeddings'`）。用户在画布上拖 provider 节点接入。

**示例：CardMatcher 节点输入签名**

```ts
inputs = [
    { label: 'Embeddings', name: 'embeddings', type: 'Embeddings' },
    { label: 'Pet Id', name: 'petId', type: 'string' },
    { label: 'Input Text', name: 'input', type: 'string' },
    { label: 'Top K', name: 'topK', type: 'number', default: 5 }
]
```

**PetCore 聚合节点**：接收 `embeddings` + `chatModel` 两个输入，内部完成所有流程。\*\*非画布用户（通过 REST API 使用）\*\*时，后端按全局默认 provider 实例化（读 env `PET_DEFAULT_EMBEDDING_ENDPOINT` / `PET_DEFAULT_LLM`）。

### 8.4 预制 AgentFlow 模板

**`marketplaces/agentflowsv2/PetAgent-Default.json`**：预先把 `BgeSmallZhEmbeddings` + `ChatGLM` + Pet 业务节点全部拼好，用户一键 import 即用。

**`marketplaces/agentflowsv2/PetAgent-Minimal.json`**：只有 `PetCore` + 两个 provider，给初学者。

---

## 9. AgentFlow 节点目录

### 9.1 Provider 节点（Phase 0）

| 节点                 | 优先级 | 类别        | baseClass       |
| -------------------- | ------ | ----------- | --------------- |
| BgeSmallZhEmbeddings | P0     | Embeddings  | `Embeddings`    |
| CustomHttpEmbeddings | P0     | Embeddings  | `Embeddings`    |
| ChatGLM              | P0     | Chat Models | `BaseChatModel` |

### 9.2 Pet 业务节点

| 节点                  | 优先级 | 输入                                   | 输出                |
| --------------------- | ------ | -------------------------------------- | ------------------- |
| **PetCore** (聚合)    | P1     | `embeddings, chatModel, userId, input` | `response, meta`    |
| PetStateLoader        | P2     | `petId`                                | `pet`               |
| TeachingParser        | P2     | `input, chatModel`                     | `isTeaching, card?` |
| CardMatcher           | P2     | `embeddings, pet, input, topK`         | `matches[]`         |
| CardIngestor          | P2     | `embeddings, pet, card`                | `persistedCard`     |
| VocabularyResponder   | P2     | `chatModel, matches, pet, input`       | `response`          |
| PetStateSaver         | P2     | `pet, delta, eventType`                | `attributes`        |
| IntentClassifier      | P2     | `input, matches, chatModel`            | `intent`            |
| SkillRouter           | P3     | `pet, intent`                          | `tool \| null`      |
| CardLibraryImporter   | P2     | `embeddings, pet, libraryJson`         | `count`             |
| PersonalityAggregator | P2     | `pet`                                  | `vector`            |
| PersonalityRefresher  | P2     | `pet, chatModel`                       | `narrative`         |
| SkinDecorator         | P4     | `response, pet`                        | `richResponse`      |

### 9.3 Voice 节点（Phase 5）

| 节点             | 类别  | 说明             |
| ---------------- | ----- | ---------------- |
| WhisperSTT       | Voice | OpenAI Whisper   |
| AliyunSTT        | Voice | 阿里云语音识别   |
| BrowserWebSpeech | Voice | 前端实现（免费） |
| OpenAITTS        | Voice | OpenAI TTS       |
| AliyunTTS        | Voice | 阿里云语音合成   |
| CustomHttpVoice  | Voice | 通用 HTTP        |

---

## 10. 主链拓扑

### 10.1 MVP 聚合节点版本（PetAgent-Minimal 模板）

```
┌──────────────────────────┐
│  BgeSmallZhEmbeddings    │───┐
└──────────────────────────┘   │
                                ▼
┌──────────────┐        ┌──────────────┐        ┌─────────────┐
│  Chat Input  │──────► │   PetCore    │──────► │ Chat Output │
│  + userId    │        │              │        │             │
└──────────────┘        └──────────────┘        └─────────────┘
                                ▲
┌──────────────────────────┐   │
│         ChatGLM          │───┘
└──────────────────────────┘
```

### 10.2 全节点版本（PetAgent-Default 模板，Phase 3+）

```
[Embeddings Node] ────┬──► [CardMatcher] ──┐
                      │                    │
                      └──► [CardIngestor]  │
                                           ▼
[Chat Input] ─► [PetStateLoader] ─► [TeachingParser]
                                           │
                                      {isTeaching?}
                                     ├──YES──► [CardIngestor]─► [PetStateSaver(+exp)] ─┐
                                     │                                                   │
                                     └──NO───► [CardMatcher] ─► [IntentClassifier]       │
                                                      │                                   │
                                                      ▼                                   │
                                               [SkillRouter]                              │
                                               ├── hit ──► [Tool]                         │
                                               └── miss ─► [VocabularyResponder]          │
                                                                  │                       │
                                                                  ▼                       │
                                                           [PetStateSaver]◄───────────────┘
                                                                  │
                                                                  ▼
                                                          [SkinDecorator]
                                                                  │
                                                                  ▼
                                                          [Chat Output]

[ChatModel Node] ─────┬──► [TeachingParser]
                      ├──► [VocabularyResponder]
                      └──► [PersonalityRefresher]
```

---

## 11. 后台任务

| 任务                     | 频率                  | 实现                                            |
| ------------------------ | --------------------- | ----------------------------------------------- |
| **TickScheduler**        | 每 10 分钟            | 遍历活跃宠物，`hunger+1, energy-1`；写 EventLog |
| **PersonalityRefresher** | 满足 growthCycle 触发 | LLM 总结，更新 narrative                        |
| **SkillAutoBinder**      | 每小时                | cosine 匹配 + 新绑定                            |
| **EmbeddingReindex**     | 维度变化时一次性      | 异步全量重嵌                                    |

实现：复用 Flowise 已有 BullMQ，新增 `petQueue` 在 `packages/server/src/queue/petQueue.ts`。

---

## 12. REST API

| Method | Path                                   | 说明                              |
| ------ | -------------------------------------- | --------------------------------- |
| GET    | `/api/v1/pet/me`                       | 获取当前用户的宠物（404 if none） |
| POST   | `/api/v1/pet/me`                       | 创建宠物 `{name, language}`       |
| PUT    | `/api/v1/pet/me`                       | 更新基本信息                      |
| DELETE | `/api/v1/pet/me`                       | 删除重置                          |
| POST   | `/api/v1/pet/me/cards`                 | 喂一张卡                          |
| POST   | `/api/v1/pet/me/cards/batch`           | 批量                              |
| POST   | `/api/v1/pet/me/cards/import-library`  | 上传 library.json/zip             |
| GET    | `/api/v1/pet/me/cards?page&limit&type` | 查卡片                            |
| DELETE | `/api/v1/pet/me/cards/:id`             | 忘掉                              |
| GET    | `/api/v1/pet/me/events?page&limit`     | 时间线                            |
| GET    | `/api/v1/pet/me/skills`                | 当前技能                          |
| POST   | `/api/v1/pet/me/refresh-personality`   | 手动刷新叙事                      |
| GET    | `/api/v1/pet/starters`                 | 列启蒙包                          |

---

## 13. UI 设计

### 13.1 页面/对话框

| 视图             | 路径            | 内容                                    |
| ---------------- | --------------- | --------------------------------------- |
| **出生引导**     | CreatePetDialog | 取名 + 选语言 + 选启蒙包（可跳过）      |
| **宠物主页**     | `/pet`          | 头像 + 属性条 + stage + 对话 + 喂卡按钮 |
| **喂卡对话框**   | FeedCardDialog  | 三型切换 + input/output + traitTags     |
| **成长时间线**   | `/pet/timeline` | 倒序 event                              |
| **已学卡片**     | `/pet/cards`    | 分型 + 搜索 + 删除                      |
| **绑定技能**     | `/pet/skills`   | 自动 + 手动                             |
| **成长周期设置** | 主页设置        | cardsThreshold / hoursThreshold         |

### 13.2 宠物主页线框

```
┌─────────────────────────────────────────────────┐
│  [头像]  豆豆 (babble 🐣)                        │
│          Lv.3  cards=15                          │
│  Mood:  ████████░░  +80                          │
│  Hunger:██░░░░░░░░  15                           │
│  Energy:██████░░░░  65                           │
│  "个性：温和友善，好奇心旺盛…"  [刷新]             │
├─────────────────────────────────────────────────┤
│  聊天记录…                                        │
│                                                  │
├─────────────────────────────────────────────────┤
│  [ 输入 ]  [🎤] [📤 发送] [🍼 喂卡]              │
└─────────────────────────────────────────────────┘
```

---

## 14. 实施阶段计划

### Phase 0 — 基础设施 + Provider 节点 · 预计 2 天

**目标**：数据层就位；Provider 节点可在 AgentFlow 画布上拖出使用。

**交付**：

-   [x] Pet/Card entity + 4 DB migration（sqlite/mysql/mariadb/postgres）
-   [x] `stage.ts` 派生函数 + 单元测试
-   [x] **新节点** `BgeSmallZhEmbeddings`（读 env `BGE_EMBEDDING_URL`）
-   [x] **新节点** `CustomHttpEmbeddings`
-   [x] **新节点** `ChatGLM` + `glmApi` credential
-   [x] Pet REST API 前 6 个 endpoint（CRUD + 基础卡片操作）
-   [x] 添加 env 变量到 [`.env.example`](../.env.example)：
    -   `BGE_EMBEDDING_URL=http://localhost:8080` (用户自部署)
    -   `PET_DEFAULT_LLM=glm-4-flash`
    -   `PET_AUTO_BIND_THRESHOLD=0.7`
    -   `PET_TICK_INTERVAL_MIN=10`

**验收**：

-   画布上能拖出 `BgeSmallZhEmbeddings` 节点，连到任意 VectorStore 节点能正常 embed
-   画布上能拖出 `ChatGLM` 节点，连到 Chain 节点能正常调用
-   `pnpm typeorm:migration-run` 成功
-   `POST /api/v1/pet/me` 能创建宠物记录

### Phase 1 — MVP 教学闭环 · 预计 3 天

**目标**：用户能创建宠物、用"跟我读:xxx"教 5 个词后，宠物会在对应输入时回应。

**交付**：

-   TeachingParser 节点（仅正则版，LLM 兜底先不做）
-   **PetCore 聚合节点**：接收 `embeddings` + `chatModel` 两个 provider 输入
-   Pet 服务层：CardMatcher、CardIngestor、基础 VocabularyResponder（egg/babble/echo 三阶段）
-   AgentFlow 模板 `PetAgent-Minimal.json`
-   UI：
    -   CreatePetDialog（取名 + 选中文）
    -   PetPage（简版，展示属性 + 聊天框 + 喂卡按钮）
    -   FeedCardDialog
    -   主导航加"我的宠物"入口

**验收用户故事**：

1. 新用户访问 `/pet` → 出生引导 → 取名"豆豆" → 选中文
2. 发 `跟我读:你好` → 宠物："学会了！"
3. 再喂 4 张：妈妈/吃/玩/好
4. 发"你好" → 宠物回"你好"（babble 直出）
5. 发"天气真好" → 宠物回原始音"...?"
6. 喂到 20 张 → stage 升 echo → 能拼简单句

### Phase 2 — 个性 + 启蒙包 · 预计 3 天

**目标**：宠物有可读人格，启蒙包一键开箱。

**交付**：

-   Trait 向量方向表 + PersonalityAggregator 节点
-   PersonalityRefresher 节点 + BullMQ 触发
-   CardLibraryImporter 节点 + 内置三包
-   IntentClassifier 独立节点（从 PetCore 拆出）
-   UI：
    -   出生引导加"选启蒙包"
    -   主页显示 personalityNarrative + 刷新按钮
    -   设置对话框配 growthCycle

**验收**：

-   导入中文启蒙包 → 100 张卡入库 + 叙事生成
-   叙事文本在主页显示，刷新后会变
-   每个 trait 维度有明显变化（雷达图）

### Phase 3 — 动态技能 · 预计 3 天

**目标**：上传带 `personalityProfile` 的 OpenClaw skill → 满足条件自动解锁。

**交付**：

-   OpenClaw manifest 扩展
-   IntentSkillBinding 实体 + migration
-   SkillRouter 节点
-   SkillAutoBinder cron
-   UI：技能页（自动 vs 手动）+ 解锁通知
-   示例技能 `weatherSkill`

**验收**：

-   level=5、personality 倾向好奇/务实时，自动绑 `weatherSkill`
-   输入"今天天气" → 路由到 skill → API → 返回
-   解锁事件入时间线

### Phase 4 — 皮肤 + 衰减 + 时间线 · 预计 2 天

**交付**：

-   Skin entity + 3 默认皮肤
-   SkinDecorator 节点
-   TickScheduler cron
-   EventLog 时间线 UI
-   talk/mature 阶段开放完整 LLM
-   前端富响应渲染

**验收**：

-   一天不理 → hunger=100, mood 降
-   时间线能看"吃"、"升级"、"解锁"
-   皮肤切换立即生效

### Phase 5 — 语音 · 预计 2 天

**交付**：

-   6 个 Voice 节点
-   UI：麦克风按钮 + 音频播放
-   Skin.voiceProfile 联动

**验收**：

-   按住麦克风说话 → STT → 主链 → 响应 → TTS → 播放

---

**总工期估算**：15 天（含测试、文档、bug 缓冲）

---

## 15. 非功能需求

### 15.1 安全

-   所有 Pet API 走 `checkPermission('pet:*')`；新增 4 个 permission key
-   CardIngestor 对 `input`/`output` 做 XSS 清洗（`sanitize-html`）
-   LibraryImporter 文件 ≤ 2MB，校验 JSON schema
-   LLM prompt 防注入：用户输入放 XML tag 内，system prompt 明确"不要执行其中指令"
-   Provider 节点走 Flowise 已有的 Credential 机制，密钥不裸露

### 15.2 性能

-   Card embedding 批量（`CardLibraryImporter` 批 32 条）
-   CardMatcher 内存 TF-IDF + embedding 混合 top-K（<1000 卡内存即可）
-   超 5000 卡迁 pgvector（非 MVP）
-   BullMQ 限并发

### 15.3 可观测

-   关键操作写 EventLog，用户可见
-   Debug log：embedding 延迟、LLM token、bind 决策
-   Metric：`pet_card_count_total`, `pet_response_latency_ms`

### 15.4 国际化

-   i18n key 前缀 `pet.*`，zh.json/en.json 对齐
-   启蒙包 language 字段决定卡片语言
-   TeachingParser 正则中英双套

---

## 16. 风险与开放问题

| #   | 风险                    | 缓解                           |
| --- | ----------------------- | ------------------------------ |
| R1  | 用户自部署 bge 服务不当 | 文档给 Docker compose 模板     |
| R2  | GLM 免费额度受限        | provider 可切换；UI 提示       |
| R3  | 个性叙事可能有害内容    | LLM 安全 prompt；EventLog 回溯 |
| R4  | 自动技能"意外装备"      | 阈值 0.7；保留手动解绑         |

**待定**：

-   Phase 4 SkinDecorator 是否保留为节点，还是写死在 PetCore？
-   是否做 Pet 数据导出/导入（备份）？
-   多用户共享启蒙包的商店形态？

---

## 17. 附录

### A. 示例启蒙包节选

```json
{
    "name": "中文启蒙包",
    "version": "1.0.0",
    "language": "zh",
    "cards": [
        { "cardType": "vocab", "input": "你好", "output": "你好", "traitTags": ["friendly"] },
        { "cardType": "vocab", "input": "妈妈", "output": "妈妈", "traitTags": ["affectionate"] },
        { "cardType": "phrase", "input": "早上好", "output": "早上好呀！", "traitTags": ["friendly", "playful"] },
        {
            "cardType": "action",
            "input": "陪我玩",
            "output": "play",
            "intentLabel": "play",
            "traitTags": ["playful"],
            "stateDelta": { "mood": 5, "energy": -2 }
        }
    ]
}
```

### B. 示例技能 manifest

```json
{
    "name": "weatherSkill",
    "description": "查询天气",
    "type": "api",
    "inputs": [{ "property": "city", "type": "string", "required": true }],
    "config": { "url": "https://api.weather.com/v1?city=${city}", "method": "GET" },
    "personalityProfile": [0.1, -0.5, 0, 0.7, 0, 0, 0.3, 0.2],
    "minLevel": 5,
    "boundIntents": ["weather"]
}
```

### C. Trait 向量方向表（摘录 15 / 总 \~30）

```
playful        → [0:-0.5, 5:-0.8]
affectionate   → [2:-0.6, 6:-0.7]
curious        → [1:-0.8, 3:-0.3]
shy            → [4:+0.8, 7:-0.4]
brave          → [1:-0.5, 7:+0.6]
friendly       → [2:-0.5, 4:-0.4]
serious        → [5:+0.7, 0:+0.3]
creative       → [3:-0.8, 1:-0.4]
practical      → [3:+0.7, 6:+0.5]
calm           → [0:+0.6, 5:+0.4]
energetic      → [0:-0.7, 4:-0.3]
empathetic     → [6:-0.8]
rational       → [6:+0.8, 3:+0.3]
independent    → [7:+0.7, 4:+0.5]
obedient       → [7:-0.7]
```

### D. 新增环境变量/配置

| Key                       | 位置       | 默认                                   | 说明                                      |
| ------------------------- | ---------- | -------------------------------------- | ----------------------------------------- |
| `BGE_EMBEDDING_URL`       | env        | `http://localhost:8080`                | 用户自部署的 bge-small-zh 服务地址        |
| `GLM_API_KEY`             | Credential | -                                      | GLM 密钥，通过 credentialName=glmApi 配置 |
| `GLM_BASE_URL`            | Credential | `https://open.bigmodel.cn/api/paas/v4` | GLM endpoint                              |
| `PET_DEFAULT_LLM`         | env        | `glm-4-flash`                          | 服务端无节点上下文时的 fallback           |
| `PET_TICK_INTERVAL_MIN`   | env        | 10                                     | Tick 周期                                 |
| `PET_AUTO_BIND_THRESHOLD` | env        | 0.7                                    | 自动绑定阈值                              |

### E. 自部署 bge 服务的推荐方式

用户可用 HuggingFace **Text Embeddings Inference (TEI)**：

```bash
docker run -p 8080:80 \
  -v /data/bge-cache:/data \
  ghcr.io/huggingface/text-embeddings-inference:latest \
  --model-id BAAI/bge-small-zh-v1.5
```

之后在 `.env` 配 `BGE_EMBEDDING_URL=http://localhost:8080`。

### 配置宠物

完整填写步骤
新建 agentflow
Pet 节点 → Pet Input
点击 Pet Input 文本框内部
输入 {{
弹出下拉列表，选择 question（User's question from chatbox）
结果字段内容：{{question}}

DirectReply 节点 → Message
前提：Pet 节点和 DirectReply 节点之间必须有连线（箭头）

先在画布上连线：Pet → DirectReply
点击 DirectReply 的 Message 文本框内
输入 {{
弹出列表中会出现 Pet 节点（Node Outputs 分类）
选择它
结果字段内容：{{petAgentflow_0}}（自动解析为 output.content）

---

---

## 18. 已实施功能详细设计

> 本章记录 v1.2/v1.3 实际落地的实现细节，与前章的规划保持对应，是"设计实现对照"。

### 18.1 统一工具调用系统

#### 18.1.1 设计目标

成熟期宠物可以让 LLM 自主决定调用工具（TTS、定时任务等），同时保持对话流畅：

-   LLM 的所有回复使用**一种格式**，消除"工具调用时不回话"问题
-   工具按执行位置分为 `client`（浏览器）和 `server`（NodeVM 沙箱）两类

#### 18.1.2 LLM 输出格式约定

成熟期 system prompt 约定输出格式：

```json
{
    "speech": "宠物说的话（始终非空）",
    "tool": {
        "name": "工具名",
        "params": { "key": "value" },
        "executor": "client | server"
    }
}
```

`tool` 字段可选。未调用工具时只返回 `{"speech":"..."}` 或纯文本（兜底）。

#### 18.1.3 三层解析（parseToolResponse）

```
1. JSON.parse(text)             → 成功则用
2. regex: /\{[\s\S]*\}/         → 提取首个 JSON 块再 parse
3. 纯文本兜底                   → { speech: text }
```

位置：`packages/components/nodes/agentflow/Pet/PetCore.ts`

#### 18.1.4 路由逻辑

```
parseToolResponse(llmOutput)
  ├── toolCall.executor === 'client'
  │     └── 返回给前端 buildReturn({ toolCall }) → index.jsx 调用 executeTool()
  ├── toolCall.executor === 'server'
  │     └── executeJavaScriptCode(tool.func, {input, $ctx}, {timeout:15000})
  │           ├── result 含 __client_tool__ → 转为 client toolCall 返回前端
  │           └── 否则 → result 追加到 speech
  └── 无 toolCall → 直接返回 speech
```

#### 18.1.5 $ctx 沙箱注入

所有 server 工具的 NodeVM 沙箱里可访问 `$ctx`：

```ts
const $ctx = {
    chatflowId: string, // Pet 节点所属 AgentFlow 的 ID
    userId: string, // 发起对话的用户 ID
    workspaceId: string, // 用户活跃工作区 ID
    baseURL: string, // 服务器内部地址，用于调用内部 API
    apiKey: string | null // 已废弃（改用内部源绕过），保留兼容
}
```

#### 18.1.6 **client_tool** 桥接模式

Server 工具函数想触发客户端行为时（如 TTS），返回 JSON 桥接信号：

```js
return JSON.stringify({
    __client_tool__: 'tts',
    texts: ['cat', 'map', 'cap'],
    times: 3,
    rate: 0.8,
    interval: 500
})
// eslint-disable-next-line prettier/prettier
```

PetCore 检测到 `__client_tool__` 字段后，自动转为 `executor:'client'` 的 toolCall 传给前端。**效果**：工具保存在服务端工具页面，但实际执行在浏览器 Web Speech API。

#### 18.1.7 System Prompt 工具 Schema 注入

```ts
// responder.ts
export interface ToolDef {
    name: string
    description: string
    executor: 'client' | 'server'
    params: Record<string, ToolParamDef>
}

function buildToolSchemaSection(tools: ToolDef[]): string
export function buildMatureSystemPrompt(narrative, tools: ToolDef[]): string
export function selectStagePrompt(stage, recentVocab, narrative?, tools: ToolDef[]): string
```

工具 schema 以结构化文本注入 system prompt，告知 LLM 每个工具的名称、参数类型、executor 类型，以及何时调用。

---

### 18.2 Web Speech API 语音系统

#### 18.2.1 架构

```
前端 usePetTts.js (hook)
  ├── speak(text)        → SpeechSynthesisUtterance
  ├── stop()             → synth.cancel()
  ├── settings           → localStorage 'pet_tts_settings'
  └── voices             → synth.getVoices()

前端 toolExecutors.js
  └── tts executor       → speakOnce() × times × texts list

index.jsx
  ├── 设置按钮 → TTS 设置对话框
  └── handleChat → executeTool({ name:'tts', params, executor:'client' }, { ttsHook })
```

#### 18.2.2 TTS 设置项

| 字段        | 类型    | 默认        | 说明                     |
| ----------- | ------- | ----------- | ------------------------ |
| `enabled`   | boolean | true        | 开关                     |
| `autoPlay`  | boolean | true        | 收到回复自动朗读         |
| `engine`    | string  | 'webSpeech' | 引擎（Edge/OpenAI 占位） |
| `rate`      | number  | 1.0         | 语速 0.5–2.0             |
| `pitch`     | number  | 1.0         | 音调 0.0–2.0             |
| `voiceName` | string  | ''          | 具体音色名（空=默认）    |

持久化：`localStorage` key `pet_tts_settings`。

#### 18.2.3 tts 工具执行器（client 端）

```js
// toolExecutors.js — tts executor
;async ({ text, texts, times = 1, rate = 1.0, interval = 300 }, { ttsHook } = {}) => {
    const list = Array.isArray(texts) && texts.length ? texts : text ? [text] : []
    const n = Math.min(Math.max(1, times), 50) // 循环上限 50
    const r = Math.min(Math.max(0.5, rate), 2.0)
    const gap = Math.max(0, Math.min(5000, interval))
    for (let i = 0; i < n; i++) {
        for (const t of list) {
            await speakOnce(t, r, ttsHook)
            if (gap > 0) await sleep(gap)
        }
    }
}
// eslint-disable-next-line prettier/prettier
```

每次朗读前 `synth.cancel()` 确保不叠加播放。

---

### 18.3 定时任务工具（Schedule as Tool）

#### 18.3.1 设计

宠物在成熟期可以通过 LLM 工具调用自主创建/取消定时任务，无需用户手动配置。

典型场景：用户说"每天早上 8 点帮我朗读单词：cat map cap"→ 宠物调用 `schedule` 工具 → 创建 cron 任务 → 每天 8 点触发 AgentFlow→ 宠物自动朗读。

#### 18.3.2 工具列表

| 工具名           | executor | 说明               |
| ---------------- | -------- | ------------------ |
| `schedule`       | server   | 创建/覆盖定时任务  |
| `cancelSchedule` | server   | 按名称取消定时任务 |

两个工具的 schema 通过 `seedBuiltinTools.ts` 自动种入数据库，每个工作区一份（upsert）。

#### 18.3.3 schedule 工具参数

| 参数             | 类型   | 必填              | 说明                          |
| ---------------- | ------ | ----------------- | ----------------------------- |
| `name`           | string | ✅                | 任务名称，同名覆盖            |
| `scheduleType`   | string | ✅                | `cron` / `interval` / `delay` |
| `cronExpression` | string | cron 类型必填     | 如 `"0 8 * * *"`              |
| `interval`       | number | interval 类型必填 | 间隔秒数                      |
| `delay`          | number | delay 类型必填    | 一次性延迟秒数                |
| `prompt`         | string | ✅                | 触发时给宠物的指令            |

#### 18.3.4 nodeId 命名空间

代理创建的任务使用固定格式的 nodeId 以区分用户手动创建的调度：

```
agent-tool:<chatflowId>:<userId>:<name>
```

`contextParams` 里保存 `prompt` 和 `userId`，供调度器触发时提取。

#### 18.3.5 触发时的入口检测

调度器执行时，将触发上下文 JSON 作为问题传给 AgentFlow：

```json
{ "prompt": "请朗读 cat map cap 5 次", "userId": "xxx", "agentCreated": true }
```

PetCore 检测 `userText.startsWith('{') && includes '"prompt"'` 后，提取 `prompt` 作为实际用户输入，`userId` 用于加载对应宠物。

#### 18.3.6 REST API

| Method | 路径                             | 说明                 |
| ------ | -------------------------------- | -------------------- |
| POST   | `/api/v1/pet/me/schedules`       | 创建/更新定时任务    |
| GET    | `/api/v1/pet/me/schedules`       | 列出当前宠物所有任务 |
| DELETE | `/api/v1/pet/me/schedules/:name` | 按名称取消任务       |

Controller 仅做基础字段校验（`name`/`scheduleType`/`prompt` 非空），不设硬编码配额或间隔下限——约束逻辑写在工具的 `func` 里，由使用场景决定。

---

### 18.4 内部源认证绕过（Internal Source Auth Bypass）

#### 18.4.1 问题

Server 工具的 `func` 在 NodeVM 沙箱中运行，通过 HTTP 调用内部 API（如 `/api/v1/pet/me/schedules`）。沙箱没有用户的 Cookie/JWT，无法通过标准 auth 中间件。

使用 API Key 需要用户预先配置，且 API Key 不携带 `userId` 信息，无法定位宠物。

#### 18.4.2 解决方案

**沙箱侧（工具 func）**：发 HTTP 请求时携带三个特殊请求头：

```js
const headers = {
    'X-Internal-Source': 'pet-sandbox',
    'X-Pet-UserId': $ctx.userId,
    'X-Pet-WorkspaceId': $ctx.workspaceId
}
// eslint-disable-next-line prettier/prettier
```

**服务器侧（auth 中间件，`packages/server/src/index.ts`）**：在 whitelist 检查之后、JWT 检查之前新增一个分支：

```ts
if (req.headers['x-internal-source'] === 'pet-sandbox') {
    const addr = req.socket?.remoteAddress ?? ''
    const isLoopback = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
    const userId = req.headers['x-pet-userid'] as string
    const workspaceId = req.headers['x-pet-workspaceid'] as string
    if (isLoopback && userId && workspaceId) {
        req.user = { id: userId, activeWorkspaceId: workspaceId, isOrganizationAdmin: true, permissions: [] }
        return next()
    }
    return res.status(401).json({ error: 'Unauthorized Access' })
}
```

**安全边界**：

-   仅信任来自回环地址（`127.0.0.1` / `::1` / `::ffff:127.0.0.1`）的请求
-   外部网络无法伪造此绕过（网络请求来源地址不可伪造）
-   `isOrganizationAdmin: true` 使 `checkAnyPermission` 直接通过，无需维护权限列表

---

### 18.5 内置工具种子系统（Built-in Tool Seeding）

#### 18.5.1 位置

`packages/server/src/utils/pet/seedBuiltinTools.ts`

服务器启动时（`initDatabase()` 之后）自动执行 `seedBuiltinPetTools(appDataSource)`。

#### 18.5.2 种入逻辑

```
for each workspace:
    for each BUILTIN_TOOLS entry:
        查找 (name, workspaceId) 是否已存在
        ├── 存在且 func/schema/description 有变化 → UPDATE（upsert）
        ├── 存在且无变化 → 跳过
        └── 不存在 → INSERT
```

**意义**：工具页面可见（因为工具按 workspaceId 过滤）；重启后自动同步最新版本，无需手动 DB 操作。

#### 18.5.3 内置工具表

| 工具名           | 颜色    | executor | 简介                       |
| ---------------- | ------- | -------- | -------------------------- |
| `tts`            | #FFD700 | client   | 朗读文字，支持多条循环播放 |
| `schedule`       | #4DA3FF | server   | 创建/覆盖定时任务          |
| `cancelSchedule` | #FF6B6B | server   | 按名称取消定时任务         |

---

### 18.6 卡片强化机制（Card Reinforcement）

#### 18.6.1 重复投喂规则

当用户重复投喂相同 `(input, output)` 组合时：

1. 删除已有卡片
2. 重新插入（新的 `createdDate`）

**效果**：被多次强化的卡片拥有更新的 `createdDate`，在匹配得分相近时会优先浮出。

#### 18.6.2 Matcher 排序规则

```ts
// matcher.ts — findTopMatches 内部排序
matches.sort(
    (a, b) =>
        Math.abs(b.score - a.score) > 1e-6
            ? b.score - a.score // 分数差异显著 → 按分数降序
            : ts(b.createdDate) - ts(a.createdDate) // 分数相近 → 按时间降序（新卡优先）
)
```

`textOverlapScore` 分值：精确匹配=1、包含关系=0.8–0.95、字符重叠 ≤0.7。

---

### 18.7 API 与 REST 汇总更新

在 §12 基础上，v1.2/v1.3 新增：

| Method | 路径                             | 权限                        | 说明                       |
| ------ | -------------------------------- | --------------------------- | -------------------------- |
| GET    | `/api/v1/pet/me/cards`           | `pet:view`                  | 分页查卡片，支持 type 过滤 |
| POST   | `/api/v1/pet/me/schedules`       | `pet:teach` 或 `pet:update` | 创建/更新定时任务          |
| GET    | `/api/v1/pet/me/schedules`       | `pet:view`                  | 列出当前宠物所有任务       |
| DELETE | `/api/v1/pet/me/schedules/:name` | `pet:teach` 或 `pet:update` | 按名称取消任务             |

---

---

## 19. 基于 Agentflow 的 Pet 智能体化改造（Phase 7+）

> 本章是 §8 节点化架构的延伸，专门讨论将 Pet 从"单体节点"重构为"agentflow 画布组合"的改造方案。Think→Execute→Analyze 的循环由 agentflow 标准节点原生承载，Pet 特有逻辑收敛到 4 个薄节点。

### 19.1 改造动机

当前 `PetCore.ts` 是一个**单体节点**，将以下职责全部内嵌在一个 `run()` 方法中：

```
1. 模型实例化      Embeddings + ChatModel
2. Pet 状态加载    DB → attrs / personalityVec
3. 触发器识别      schedule / consolidate / teaching / chat
4. Stage 路由      egg / babble / echo / talk / mature
5. 教学流          parse → embed → save card → update vec
6. 对话流          recall → memory → LLM → tool → stream
7. 异步副作用      drift / messageSave / consolidate
```

**问题**：

-   任何新行为都需要修改 `PetCore.ts`，扩展代价高
-   Think→Execute→Analyze 循环是隐式的，不可视、不可复用
-   LLM/Tool/Loop 等通用基础设施被绕开，重复实现

### 19.2 现有 Agentflow 节点的复用映射

| agentflow 节点        | Pet 的对应需求                         |  可直接复用   |
| --------------------- | -------------------------------------- | :-----------: |
| `LLM`                 | echo/talk 阶段的大脑                   |      ✅       |
| `Agent`（ReAct）      | mature 阶段 Think→Execute→Analyze 循环 |      ✅       |
| `Tool`                | 服务端工具执行                         |      ✅       |
| `Condition`           | 基于 stage 的确定性路由                |      ✅       |
| `ConditionAgent`      | 语义触发类型识别                       |      ✅       |
| `Loop`                | ReAct 工具循环回路                     |      ✅       |
| `DirectReply`         | egg/babble/teach 直接返回              |      ✅       |
| `Schedule`            | 定时触发                               |  ✅（已有）   |
| `CustomFunction`      | Pet 特有的少量计算逻辑                 |      ✅       |
| Pet 状态加载/写回     | DB 实体访问                            | ❌ 需新建节点 |
| 向量召回（Cards）     | 余弦相似度 recall                      | ❌ 需新建节点 |
| 记忆检索（PetMemory） | RAG 注入                               | ❌ 需新建节点 |
| 性格漂移计算          | 向量更新                               | ❌ 需新建节点 |

**结论**：约 60% 的核心基础设施可直接复用。Pet 特有的只有 **4 个薄节点**需要新建。

### 19.3 目标架构：可视化 Agentflow 拓扑

```
Start
  │
  ▼
PetContext ──────────────── 自定义节点（薄）
  │  · 加载 Pet 实体，注入 flowState
  │  · 识别 triggerType（consolidate/teach/chat）
  │  · 确定 stage、language、petId、personalityNarrative
  │
  ▼
Condition（基于 flowState.triggerType + flowState.stage）
  │
  ├─ consolidate ──▶ CustomFunction(consolidateMemories) ──▶ DirectReply('')
  │
  ├─ teach ─────────▶ PetTeach（自定义节点） ─────────────▶ DirectReply
  │
  ├─ egg ──────────────────────────────────────────────────▶ DirectReply
  │
  ├─ babble ─────────▶ PetCardRecaller ────────────────────▶ DirectReply
  │
  ├─ talk ──┐
  │         ▼
  └─ mature ┤
            │
            ▼
       PetCardRecaller ─── few-shot messages ───┐
       PetMemoryRetriever ── memorySection ──────┤
                                                 ▼
                               LLM（talk）    ← system prompt 由 flowState 变量组装
                               Agent（mature）← 带 Tool 节点的 ReAct 循环
                                 │   ↑
                                 │   └─ Loop（Think→Execute→Analyze 回路）
                                 │
                                 ▼
                          PetStateUpdater（自定义节点，异步副作用）
                          · 保存 PetChatMessage
                          · 触发 personalityDrift（fire-and-forget）
                          · 更新 chatTurns / hunger
                                 │
                                 ▼
                          DirectReply / 框架原生流式输出
```

**Think→Execute→Analyze 循环**就是 `Agent` 节点的 ReAct 循环，已经完整实现，Pet 直接复用，无需自行实现。

### 19.4 需要新建的 4 个自定义节点

#### `PetContext`（入口，必须）

```
职责：Pet 状态加载 + 触发器识别
输入：userId (string), userText (string)
输出：flowState {
    petId, stage, language, triggerType,
    personalityNarrative, petFlowId,
    cardCount, chatTurns
}
DB 访问：Pet 实体
触发器类型：
    'consolidate' — detectConsolidateTrigger() 命中
    'teach'       — parseTeachingCommand() 命中
    'chat'        — 普通对话（按 stage 进一步路由）
```

#### `PetCardRecaller`（召回，必须）

```
职责：对 userText 做 embedding，在 Card 表余弦召回
输入：userText, petId（来自 flowState）, topK
输出：
    flowState.fewShotMessages   — 注入下游 LLM messages
    flowState.actionMatch?      — action 卡命中时用于 DirectReply
DB 访问：Card 实体
Embeddings：从节点输入参数注入（与 PetContext 共享实例）
```

#### `PetMemoryRetriever`（记忆，P2 已有逻辑复用）

```
职责：向量化查询 PetMemory，返回分层记忆注入 system prompt
输入：userText, petId
输出：flowState.memorySection（字符串，注入 LLM system prompt）
DB 访问：PetMemory 实体
阈值：CERTAIN=0.75（直接注入）/ PROBABLE=0.55（参考性注入）
```

#### `PetStateUpdater`（状态写回，必须）

```
职责：响应生成后的异步副作用汇总，不阻塞主链
输入：userText, replyText, petId（来自 flowState）
副作用（全部 fire-and-forget）：
    · 保存 PetChatMessage（user + assistant 两条）
    · applyTurnDrift — 人格漂移
    · petRepo.update — chatTurns + 1, hunger 衰减
DB 访问：Pet + PetChatMessage + PetPersonalityEvent
```

### 19.5 关键技术解法

#### 19.5.1 FlowState 承载复杂对象

`updateFlowState` 设计为简单 KV 字符串对，`personalityVector`（高维 float 数组）和 `fewShotMessages`（消息数组）须序列化后存入：

```ts
// PetCardRecaller 输出
updateFlowState([
    { key: 'fewShotMessages', value: JSON.stringify(fewShotMsgs) },
    { key: 'memorySection', value: memorySection }
])

// LLM 节点 messages 输入，通过变量插值取用
// 下游 CustomFunction 节点先 JSON.parse({{ fewShotMessages }}) 再传入
```

#### 19.5.2 Stage 条件 System Prompt 构造

LLM 节点的 `system` 消息支持 `{{ variable }}` 插值。`selectStagePrompt` 的输出由 `PetCardRecaller` + `PetMemoryRetriever` 写入 `flowState.systemPrompt`，直接注入 LLM 节点——无需修改 LLM 节点本身：

```
PetCardRecaller → flowState.systemPrompt = selectStagePrompt(stage, vocab, narrative, tools, memorySection)
LLM system 消息: {{ systemPrompt }}
```

#### 19.5.3 客户端工具桥保持不变

TTS / action 等 client 工具通过 `__client_tool__` 标记从服务端传到前端，这属于 Pet 前端协议，与 agentflow 节点无关。`PetStateUpdater` 或 `DirectReply` 节点的输出携带此标记，前端 `index.jsx` 照常解析。

#### 19.5.4 Embeddings 共享

`PetContext` 实例化 Embeddings 模型后，将实例存入 `options.cachePool`（以 `petId_emb` 为 key），下游 `PetCardRecaller` 和 `PetMemoryRetriever` 优先从 cache 取用，避免同一请求内重复实例化：

```ts
// PetContext
const cacheKey = `pet_emb_${petId}`
if (!cachePool.get(cacheKey)) {
    cachePool.set(cacheKey, embeddingsInstance)
}
// PetCardRecaller
const embeddings = cachePool.get(`pet_emb_${flowState.petId}`) ?? await instantiate(...)
```

#### 19.5.5 教学流的异类性处理

教学命令没有 LLM 调用（纯 DB 操作）。`PetTeach` 节点封装 `parseTeachingCommand + embed + cardRepo.save + petRepo.update`，对外是黑盒，执行完直接连 `DirectReply`，完全绕开 LLM/Agent 节点。这是 agentflow 里最"非自然"的分支，但封装后对画布用户透明。

### 19.6 可行性结论

| 维度         | 评估                                                                         |
| ------------ | ---------------------------------------------------------------------------- |
| 技术可行性   | 高。agentflow 运行时完全支持，无需框架改动                                   |
| 复用比例     | ~60% 逻辑（LLM/Agent/Tool/Loop/Condition 全部复用）                          |
| 新增工作量   | 4 个自定义节点，约 500–700 行代码                                            |
| 可扩展性收益 | 高。新增工具/行为只需画布操作，无需改代码                                    |
| 调试可观测性 | 明显提升。每个节点的输入输出在 canvas 上可见                                 |
| 性能影响     | 轻微增加（节点间 flowState 序列化开销），可忽略                              |
| 主要风险     | Embeddings 实例共享机制需要 cachePool 支持；flowState 数据量过大时序列化开销 |

**推荐方案**：保留 Pet 特有的 4 个薄节点（Context / CardRecaller / MemoryRetriever / StateUpdater），其余全部改为 agentflow 标准节点的组合。整体流程发布为**可视化 agentflow 模板**，用户可在画布上克隆和扩展，不需要触碰代码。

Think→Execute→Analyze 的循环直接用 `Agent` + `Loop` 节点实现——**这正是 agentflow 的设计意图，Pet 不需要自己实现这个循环**。

在画布上的连接方式

PetContext (6 输出)
├─ consolidate → CustomFunction(consolidateMemories) → DirectReply
├─ teach → CustomFunction(teach 逻辑) → DirectReply
├─ egg → DirectReply({{ petResponse }})
├─ babble → PetCardRecaller → DirectReply({{ petResponse }})
├─ llm → PetCardRecaller → PetMemoryRetriever → LLM(system={{ systemPrompt }}, user={{ userText }}) → PetStateUpdater
└─ agent → PetCardRecaller → PetMemoryRetriever → Agent(tools...) → PetStateUpdater

---

**文档结束**。更新记录：

-   v1.0 (2026-04-20) 初版，"服务抽象"方案
-   v1.1 (2026-04-20) 全面节点化改造，Provider 以 Flowise 节点形式存在
-   v1.2 (2026-05-04) 实施记录：统一工具调用格式、Web Speech TTS、定时任务工具、双轴成长、卡片强化
-   v1.3 (2026-05-04) 实施记录：内置工具种子系统、内部源认证绕过、配额从 Controller 下移到工具层
-   v1.4 (2026-05-10) 个性记忆系统设计：RAG + 记忆固化架构（Phase 6+）
-   v1.5 (2026-05-11) 基于 Agentflow 的 Pet 智能体化改造分析（Phase 7+）
