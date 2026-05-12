# Pet 节点使用指南

**版本** v1.2 · **最后更新** 2026-05-11

> 本文档介绍如何在 Flowise AgentFlow 中配置 Pet 节点，构建一只会成长、会学习的 AI 宠物。
> v1.2 新增 **Agentflow 组合模式**（§2），将宠物的 Think→Execute→Analyze 循环完全可视化地组装在画布上。

---

## 目录

-   [1. 快速开始](#1-快速开始)
-   [2. Agentflow 组合模式（推荐）](#2-agentflow-组合模式推荐)
    -   [2.1 架构概览](#21-架构概览)
    -   [2.2 节点总览与变量引用规则](#22-节点总览与变量引用规则)
    -   [2.3 节点逐一配置](#23-节点逐一配置)
    -   [2.4 连线检查清单](#24-连线检查清单)
    -   [2.5 overrideConfig 与 API 调用](#25-overrideconfig-与-api-调用)
    -   [2.6 绑定 Agentflow 到 Pet](#26-绑定-agentflow-到-pet)
    -   [2.7 快速验证](#27-快速验证)
-   [3. 经典聚合节点模式（PetCore）](#3-经典聚合节点模式petcore)
    -   [3.1 Pet 节点参数](#31-pet-节点参数)
    -   [3.2 Embedding Model 配置](#32-embedding-model-配置)
    -   [3.3 Chat Model 配置](#33-chat-model-配置)
-   [4. 教学系统](#4-教学系统)
-   [5. 成长阶段](#5-成长阶段)
-   [6. 个性系统](#6-个性系统)
-   [7. 技能系统](#7-技能系统)
-   [8. API 接口](#8-api-接口)
-   [9. 常见问题](#9-常见问题)

---

## 1. 快速开始

### 1.1 前置条件

部署 **bge-small-zh** 嵌入模型服务（二选一）：

```bash
# HuggingFace TEI（推荐）
docker run -d --name bge-small-zh \
  -p 8081:80 \
  -v D:\data\bge-cache:/data \
  ghcr.io/huggingface/text-embeddings-inference:cpu-latest \
  --model-id BAAI/bge-small-zh-v1.5
```

### 1.2 创建宠物

通过 API 创建宠物（或在 UI"我的宠物"页面操作）：

```http
POST /api/v1/pet/me
Content-Type: application/json

{ "name": "豆豆", "language": "zh" }
```

### 1.3 选择配置模式

| 模式                         | 适合场景                                     | 核心节点                                                            |
| ---------------------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| **Agentflow 组合模式**（§2） | 需要可视化扩展、添加自定义工具、调整分支逻辑 | PetContext + PetCardRecaller + PetMemoryRetriever + PetStateUpdater |
| **经典聚合模式**（§3）       | 快速上手，零配置                             | PetCore（单节点）                                                   |

---

## 2. Agentflow 组合模式（推荐）

### 2.1 架构概览

宠物的完整对话流程拆分为 6 个可视化分支，每个分支对应一种触发类型或成长阶段：

```
Start
  │
  ▼
Pet Context ─────────────────────────────────────────────────────
  │ (6输出)
  ├─ consolidate ─▶ DirectReply ("")
  │
  ├─ teach ──────▶ CustomFunction (教学逻辑) ──▶ DirectReply
  │
  ├─ egg ────────▶ DirectReply (原始音)
  │
  ├─ babble ─────▶ Pet Card Recaller ──▶ DirectReply (召回内容)
  │
  ├─ llm ────────▶ Pet Card Recaller ──▶ Pet Memory Retriever
  │                                            │
  │                                            ▼
  │                                           LLM
  │                                            │
  │                                            ▼
  │                                    Pet State Updater  ← 终止节点，自动流式输出
  │
  └─ agent ──────▶ Pet Card Recaller ──▶ Pet Memory Retriever
                                               │
                                               ▼
                                             Agent + Tool节点…
                                               │
                                               ▼
                                       Pet State Updater  ← 终止节点，自动流式输出
```

**Think→Execute→Analyze 循环**由 `Agent` 节点的 ReAct 机制原生承载，无需手动实现。

---

### 2.2 节点总览与变量引用规则

画布中每个节点被框架自动编号，格式为 `{节点名}_{index}`（从 0 计）：

| 节点                 | 类型名                        | 画布 ID（示例）                 | output.content                   |
| -------------------- | ----------------------------- | ------------------------------- | -------------------------------- |
| Pet Context          | `petContextAgentflow`         | `petContextAgentflow_0`         | egg→ 原始音；其他 →userText      |
| Pet Card Recaller    | `petCardRecallerAgentflow`    | `petCardRecallerAgentflow_0`    | babble→ 召回文本；其他 →userText |
| Pet Memory Retriever | `petMemoryRetrieverAgentflow` | `petMemoryRetrieverAgentflow_0` | **完整 system prompt**           |
| LLM                  | `llmAgentflow`                | `llmAgentflow_0`                | LLM 回复文本                     |
| Agent                | `agentAgentflow`              | `agentAgentflow_0`              | Agent 最终回复文本               |
| Pet State Updater    | `petStateUpdaterAgentflow`    | `petStateUpdaterAgentflow_0`    | 同 Reply 输入                    |
| DirectReply（多个）  | `directReplyAgentflow`        | `directReplyAgentflow_0/1/2…`   | —                                |

**如何引用变量**：在任意输入框中输入 `{{`，从弹出的 **Node Outputs** 下拉中选择对应节点，框架自动填入正确的 ID。

---

### 2.3 节点逐一配置

#### Pet Context

**位置**：紧接 Start 节点。

| 字段          | 配置值                      | 说明                                                               |
| ------------- | --------------------------- | ------------------------------------------------------------------ |
| **User ID**   | 留空（或 `{{ question }}`） | 优先从 `overrideConfig.petUserId` 自动解析；需要固定用户时手动填写 |
| **Pet Input** | 选择 `question`             | 用户从聊天框输入的原始文本                                         |

输出端口说明：

| 输出端口      | 触发条件                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------- |
| `consolidate` | 收到 `{"__consolidate__": true, "userId": "..."}` payload（MemoryConsolidator cron 触发） |
| `teach`       | 检测到教学命令（跟我读 / 教你做 / learn: 等）                                             |
| `egg`         | 宠物处于 egg 阶段（0 张卡）                                                               |
| `babble`      | 宠物处于 babble 阶段（1–39 张卡）                                                         |
| `llm`         | echo / talk 阶段（40–499 张卡）                                                           |
| `agent`       | mature 阶段（500+ 张卡）                                                                  |

---

#### consolidate 分支

```
Pet Context (consolidate) ──▶ DirectReply
```

**DirectReply** 配置：

| 字段    | 配置值         |
| ------- | -------------- |
| Message | `（空字符串）` |

> 此分支由后台 cron 触发，用户不可见，静默返回即可。

---

#### teach 分支

```
Pet Context (teach) ──▶ CustomFunction ──▶ DirectReply
```

**CustomFunction** — JavaScript 代码：

```js
const state = $flow.state
const language = state.language || 'zh'
const parsed = JSON.parse(state.parsedTeach || 'null')
if (!parsed) return language === 'zh' ? '学习失败，请重试' : 'Learning failed, please retry'

const resp = await fetch(`${$ctx.baseURL}/api/v1/pet/me/cards`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-Internal-Source': 'pet-sandbox',
        'X-Pet-UserId': $ctx.userId,
        'X-Pet-WorkspaceId': $ctx.workspaceId
    },
    body: JSON.stringify({
        cardType: parsed.cardType,
        input: parsed.input,
        output: parsed.output,
        traitTags: parsed.traitTags || []
    })
})
if (!resp.ok) return language === 'zh' ? '学习遇到问题，请稍后重试' : 'Learning failed'
return language === 'zh' ? `好的，我记住了！学会了"${parsed.input}"` : `Got it! I learned "${parsed.input}"`
```

**DirectReply** 配置：

| 字段    | 配置值                            |
| ------- | --------------------------------- |
| Message | `{{ customFunctionAgentflow_0 }}` |

---

#### egg 分支

```
Pet Context (egg) ──▶ DirectReply
```

**DirectReply** 配置：

| 字段    | 配置值                        |
| ------- | ----------------------------- |
| Message | `{{ petContextAgentflow_0 }}` |

> PetContext 在 egg 分支时 `output.content` = 已生成的原始音（`"...?"` / `"咕~"` 等），DirectReply 直接输出。

---

#### babble 分支

```
Pet Context (babble) ──▶ Pet Card Recaller ──▶ DirectReply
```

**Pet Card Recaller** 配置：

| 字段            | 配置值                                        |
| --------------- | --------------------------------------------- |
| Embedding Model | 选择你的嵌入模型（如 `BgeSmallZhEmbeddings`） |

> babble 阶段时，PetCardRecaller 对用户输入做向量召回：相似度超过 0.8 则返回卡片内容，否则返回原始音。`output.content` = 召回结果。

**DirectReply** 配置：

| 字段    | 配置值                             |
| ------- | ---------------------------------- |
| Message | `{{ petCardRecallerAgentflow_0 }}` |

---

#### llm 分支（echo / talk 阶段）

```
Pet Context (llm)
  ─▶ Pet Card Recaller ─▶ Pet Memory Retriever ─▶ LLM ─▶ Pet State Updater
```

**Pet Card Recaller**：同 babble 分支配置（选择 Embedding Model）。

**Pet Memory Retriever**：无需手动配置（全部从 flowState 读取）。

**LLM** 配置：

| 字段                       | 配置值                                | 说明                                                          |
| -------------------------- | ------------------------------------- | ------------------------------------------------------------- |
| Model                      | 选择 Chat 模型（如 `ChatGLM`）        | —                                                             |
| Messages → **System** 条目 | `{{ petMemoryRetrieverAgentflow_0 }}` | 完整 system prompt（含成长阶段指令、记忆片段、few-shot 示例） |
| Messages → **User** 条目   | `{{ petContextAgentflow_0 }}`         | 实际用户文本（已从 schedule trigger 中提取）                  |
| Enable Memory              | **关闭**                              | Pet 自己管理对话历史                                          |

> **添加 Messages 步骤**：点击 LLM 节点 Messages 字段的 `+` → 选择角色 System → 在内容框输入 `{{` → 选择 `petMemoryRetrieverAgentflow_0`。User 条目同理。

**Pet State Updater** 配置：

| 字段               | 配置值                 | 说明                                  |
| ------------------ | ---------------------- | ------------------------------------- |
| Reply              | `{{ llmAgentflow_0 }}` | LLM 节点输出（自动流式输出回复）      |
| Chat Model（可选） | 选择同一 Chat 模型     | 启用后触发性格漂移（fire-and-forget） |

> **Pet State Updater 是此分支的终止节点**。`isLastNode=true` 时自动流式输出，无需再连接 DirectReply。

---

#### agent 分支（mature 阶段）

```
Pet Context (agent)
  ─▶ Pet Card Recaller ─▶ Pet Memory Retriever ─▶ Agent + [Tool…] ─▶ Pet State Updater
```

**Pet Card Recaller / Pet Memory Retriever**：同 llm 分支配置。

**Agent** 配置：

| 字段           | 配置值                                |
| -------------- | ------------------------------------- |
| Model          | 选择 Chat 模型                        |
| System Prompt  | `{{ petMemoryRetrieverAgentflow_0 }}` |
| Human Message  | `{{ petContextAgentflow_0 }}`         |
| Enable Memory  | **关闭**                              |
| Max Iterations | `5`（可根据工具复杂度调整）           |

**Tool 节点**（每个工具对应一个节点，连接到 Agent）：

| Tool             | 说明                           |
| ---------------- | ------------------------------ |
| `tts`            | 客户端朗读（内置，自动种入）   |
| `schedule`       | 创建定时任务（内置，自动种入） |
| `cancelSchedule` | 取消定时任务（内置，自动种入） |
| 自定义工具       | 在 Tools 页面创建后从列表选择  |

**Pet State Updater** 配置：

| 字段               | 配置值                   |
| ------------------ | ------------------------ |
| Reply              | `{{ agentAgentflow_0 }}` |
| Chat Model（可选） | 选择同一 Chat 模型       |

---

### 2.4 连线检查清单

保存前逐项确认：

```
□ Start → Pet Context
□ Pet Context (consolidate) → DirectReply
□ Pet Context (teach) → CustomFunction → DirectReply
□ Pet Context (egg) → DirectReply
□ Pet Context (babble) → Pet Card Recaller → DirectReply
□ Pet Context (llm) → Pet Card Recaller → Pet Memory Retriever → LLM → Pet State Updater
□ Pet Context (agent) → Pet Card Recaller → Pet Memory Retriever → Agent → Pet State Updater
□ Agent 已连接所有 Tool 节点
□ Pet Card Recaller 已选择 Embedding Model
□ LLM / Agent 已选择 Chat Model
□ LLM System Message  = {{ petMemoryRetrieverAgentflow_0 }}
□ LLM User Message    = {{ petContextAgentflow_0 }}
□ Pet State Updater Reply（llm 分支）  = {{ llmAgentflow_0 }}
□ Pet State Updater Reply（agent 分支）= {{ agentAgentflow_0 }}
□ Pet State Updater 是各分支的最后一个节点（无下游连线）
```

---

### 2.5 overrideConfig 与 API 调用

通过 REST API 调用时在请求体中传入 userId：

```http
POST /api/v1/prediction/{chatflowId}
Content-Type: application/json

{
  "question": "你好",
  "overrideConfig": {
    "petUserId": "user-123"
  }
}
```

UI 端（PetPage）调用时，确认 API 调用层已注入 `overrideConfig.petUserId`。

---

### 2.6 绑定 Agentflow 到 Pet

保存 Agentflow 后，将其 ID 写入 Pet 的 `petFlowId` 字段（`MemoryConsolidator` cron 需要此字段来触发后台记忆固化）：

```http
PUT /api/v1/pet/me
Content-Type: application/json

{ "petFlowId": "<chatflow-id>" }
```

---

### 2.7 快速验证

| 测试输入                                     | 期望走到的分支 | 期望输出                       |
| -------------------------------------------- | -------------- | ------------------------------ |
| 任意文字（新宠物，0 张卡）                   | egg            | `...?` / `咕~` 等原始音        |
| 任意文字（已有 5 张卡）                      | babble         | 召回卡片内容或原始音           |
| `跟我读:你好`                                | teach          | `好的，我记住了！学会了"你好"` |
| 任意文字（200+ turns）                       | llm            | LLM 生成，含记忆与性格         |
| 任意文字（500+ turns）                       | agent          | Agent ReAct，可使用工具        |
| `{"__consolidate__": true, "userId": "..."}` | consolidate    | 空回复，后台触发记忆固化       |

---

## 3. 经典聚合节点模式（PetCore）

适合快速上手，一个节点包含完整逻辑。

### 3.1 基本拓扑

```
Start → Pet → DirectReply
```

1. 新建 Agentflow，依次拖入 **Start**、**Pet**、**DirectReply**
2. 按顺序连线
3. Pet 节点 → **Pet Input** 字段 → 选择 `question`
4. DirectReply 节点 → **Message** 字段 → 选择 Pet 节点输出（`{{ petAgentflow_0 }}`）

### 3.2 Pet 节点参数

| 参数                | 类型   | 必填 | 说明                                   |
| ------------------- | ------ | ---- | -------------------------------------- |
| **Embedding Model** | 选择   | ✅   | 嵌入模型，推荐 BgeSmallZhEmbeddings    |
| **Chat Model**      | 选择   | ❌   | echo 阶段及以上必须，egg/babble 可省略 |
| **User ID**         | 字符串 | ❌   | 从 `overrideConfig.petUserId` 自动解析 |
| **Pet Input**       | 字符串 | ✅   | 选择 `question`                        |
| **Server Tools**    | 多选   | ❌   | mature 阶段可用的服务端工具            |

### 3.3 Embedding Model 配置

| 参数             | 说明         | 默认值                  |
| ---------------- | ------------ | ----------------------- |
| **Endpoint**     | TEI 服务地址 | `http://localhost:8081` |
| **Batch Size**   | 批处理大小   | 32                      |
| **Timeout (ms)** | 超时时间     | 30000                   |

### 3.4 Chat Model 配置

推荐 **ChatGLM** 节点（`glm-4-flash`，免费额度充足）：

| 参数        | 建议值        |
| ----------- | ------------- |
| Model       | `glm-4-flash` |
| Temperature | 0.7–0.9       |
| Max Tokens  | 2048          |

---

## 4. 教学系统

### 4.1 卡片类型

| 类型       | 说明     | 示例                          |
| ---------- | -------- | ----------------------------- |
| **vocab**  | 词汇卡片 | `跟我读:你好`                 |
| **phrase** | 短语卡片 | `跟我学:看到妈妈说"妈妈你好"` |
| **action** | 动作卡片 | `教你做:听到"玩"就 play`      |

### 4.2 教学指令格式

#### 中文指令

| 格式                | 类型   |
| ------------------- | ------ |
| `跟我读:XXX`        | vocab  |
| `跟我学:XXX说"YYY"` | phrase |
| `记住:XXX=>YYY`     | phrase |
| `教你做:XXX就YYY`   | action |

#### 英文指令

| 格式                        | 类型   |
| --------------------------- | ------ |
| `repeat after me: XXX`      | vocab  |
| `learn: say "XXX" when YYY` | phrase |

### 4.3 启蒙包导入

内置三个启蒙包，创建宠物时可一键导入：

| 启蒙包                   | 语言 | 内容             |
| ------------------------ | ---- | ---------------- |
| `starter-zh.json`        | 中文 | 100 词 + 30 行动 |
| `starter-en.json`        | 英文 | 100 词 + 30 行动 |
| `starter-bilingual.json` | 双语 | 200 词 + 60 行动 |

### 4.4 卡片强化机制

重复投喂相同 `(input, output)` 组合时，旧卡片会被删除并重新插入（刷新 `createdDate`）。分数相近时，更新的卡片优先浮出，强化学习效果。

---

## 5. 成长阶段

成长进度由双轴驱动：`progress = cardCount × 2 + chatTurns`

| 阶段          | progress 阈值 | 输出策略                                   | 可解锁能力      |
| ------------- | ------------- | ------------------------------------------ | --------------- |
| 🥚 **egg**    | 0–1           | 预设原始音随机（`.../?/~/咕`）             | 仅学习指令      |
| 🐣 **babble** | 2–39          | RAG top-1 cosine>0.8 直出，否则原始音      | 学习、简单回应  |
| 👶 **echo**   | 40–199        | 小 LLM + 词汇白名单 + top-5 few-shot       | 以上 + 意图识别 |
| 🧒 **talk**   | 200–499       | 完整 LLM + personalityNarrative + 记忆检索 | 以上 + 手动技能 |
| 🧑 **mature** | ≥500          | 完整 LLM，高自由度 + 工具调用              | 全部 + 自动技能 |

---

## 6. 个性系统

### 6.1 性格维度（8 维向量）

| 维度 | 负向 ← → 正向 | 含义      |
| ---- | ------------- | --------- |
| 0    | 活泼 ← → 沉稳 | 能量/节奏 |
| 1    | 好奇 ← → 谨慎 | 探索意愿  |
| 2    | 温和 ← → 直接 | 沟通风格  |
| 3    | 创意 ← → 务实 | 思维偏好  |
| 4    | 外向 ← → 内省 | 社交倾向  |
| 5    | 玩心 ← → 严肃 | 幽默感    |
| 6    | 共情 ← → 理性 | 情感取向  |
| 7    | 顺从 ← → 主见 | 自主性    |

### 6.2 traitTags 参考

| 标签           | 含义                               |
| -------------- | ---------------------------------- |
| `playful`      | 玩心强（→ dim5 负向）              |
| `affectionate` | 温和亲和（→ dim2 负向、dim6 负向） |
| `curious`      | 好奇（→ dim1 负向）                |
| `serious`      | 严肃（→ dim5 正向）                |
| `independent`  | 主见（→ dim7 正向）                |

### 6.3 个性记忆系统（Phase 6+）

talk / mature 阶段对话时，Pet Memory Retriever 会检索历史记忆片段注入 system prompt：

| 置信层 | 相似度阈值 | 注入方式                   |
| ------ | ---------- | -------------------------- |
| 高置信 | ≥ 0.75     | 直接注入「你确定记得的事」 |
| 中置信 | 0.55–0.75  | 参考注入「你隐约记得的事」 |

记忆由 **MemoryConsolidator** 每小时固化一次（需设置 `petFlowId`）。

---

## 7. 技能系统

### 7.1 技能解锁

| 方式     | 条件                                                        |
| -------- | ----------------------------------------------------------- |
| 手动绑定 | talk 阶段起，在宠物页面或通过 API 绑定                      |
| 自动绑定 | mature 阶段，性格余弦相似度 > 0.7 时 SkillAutoBinder 自动绑 |

### 7.2 意图-技能绑定

| 字段            | 说明                              |
| --------------- | --------------------------------- |
| `intent`        | 意图标签（如 `weather`、`music`） |
| `skillToolId`   | 关联的 Tool ID                    |
| `source`        | `manual` 或 `auto`                |
| `autoBindScore` | 自动绑定时的余弦得分              |
| `priority`      | 同意图多绑定时的优先级            |

### 7.3 在 Agentflow 中使用技能

在 **agent 分支**中，将工具节点连接到 Agent 节点即可。Agent 的 ReAct 循环会自动决定何时调用哪个工具：

```
Pet Memory Retriever ─▶ Agent ─▶ [Tool: tts]
                              └─▶ [Tool: schedule]
                              └─▶ [Tool: weatherSkill]
                                     …
```

### 7.4 创建自定义技能

技能使用 OpenClaw Manifest 格式，加入 Phase 3 扩展字段后支持自动绑定：

```json
{
    "name": "weatherSkill",
    "description": "查询天气",
    "type": "api",
    "inputs": [{ "property": "city", "type": "string", "required": true }],
    "config": { "url": "https://api.weather.com?city=${city}", "method": "GET" },
    "personalityProfile": [0.1, -0.5, 0, 0.7, 0, 0, 0.3, 0.2],
    "minLevel": 5,
    "boundIntents": ["weather", "forecast"]
}
```

---

## 8. API 接口

### 宠物 CRUD

| Method | 路径             | 说明                           |
| ------ | ---------------- | ------------------------------ |
| GET    | `/api/v1/pet/me` | 获取当前用户的宠物             |
| POST   | `/api/v1/pet/me` | 创建宠物 `{name, language}`    |
| PUT    | `/api/v1/pet/me` | 更新基本信息（含 `petFlowId`） |
| DELETE | `/api/v1/pet/me` | 删除重置                       |

### 卡片管理

| Method | 路径                                  | 说明                       |
| ------ | ------------------------------------- | -------------------------- |
| POST   | `/api/v1/pet/me/cards`                | 喂一张卡                   |
| POST   | `/api/v1/pet/me/cards/batch`          | 批量喂卡                   |
| POST   | `/api/v1/pet/me/cards/import-library` | 导入启蒙包                 |
| GET    | `/api/v1/pet/me/cards`                | 查看卡片（支持 type 过滤） |
| DELETE | `/api/v1/pet/me/cards/:id`            | 删除卡片                   |

### 定时任务

| Method | 路径                             | 说明              |
| ------ | -------------------------------- | ----------------- |
| POST   | `/api/v1/pet/me/schedules`       | 创建/更新定时任务 |
| GET    | `/api/v1/pet/me/schedules`       | 列出所有定时任务  |
| DELETE | `/api/v1/pet/me/schedules/:name` | 按名称取消任务    |

### 对话

```http
POST /api/v1/prediction/{chatflowId}
Content-Type: application/json

{
  "question": "你好",
  "overrideConfig": { "petUserId": "user-123" }
}
```

### 技能绑定

| Method | 路径                                     | 说明                                       |
| ------ | ---------------------------------------- | ------------------------------------------ |
| GET    | `/api/v1/pets/:petId/skill-bindings`     | 查看绑定列表                               |
| POST   | `/api/v1/pets/:petId/skill-bindings`     | 手动绑定 `{intent, skillToolId, priority}` |
| DELETE | `/api/v1/pets/:petId/skill-bindings/:id` | 删除绑定                                   |

---

## 9. 常见问题

### Q1: 变量 ID 和文档里不一样怎么办？

画布 ID 由 **节点类型 + 当前画布中该类型的序号** 决定。如果你的 LLM 节点是画布上第 2 个 LLM，ID 就是 `llmAgentflow_1`。建议：在输入框内输入 `{{` 然后从下拉中选择，不要手打 ID。

### Q2: Pet State Updater 后面还要接 DirectReply 吗？

不需要。Pet State Updater 在 `isLastNode=true` 时（即没有下游节点）会自动流式输出回复。连接 DirectReply 反而会让 Pet State Updater 变成中间节点，丢失流式输出能力。

### Q3: llm / agent 分支的 Pet Card Recaller 是同一个节点还是两个？

如果两条分支都需要 Pet Card Recaller，需要**两个独立的节点**（一个连 llm 输出，一个连 agent 输出）。Flowise 画布中每个节点实例只能有一条入边（来自分支）。

### Q4: 如何只用 llm 分支而不用 agent 分支？

当宠物还没到 mature 阶段时，agent 分支不会被触发。你可以暂时不配置 agent 分支，待宠物成长后再补充。

### Q5: 经典 PetCore 模式还能用吗？

可以。PetCore 节点保持不变，两种模式并存。对于只需要基础功能的场景，PetCore 更简单。

### Q6: 宠物不回复怎么办？

1. 确认 Agentflow 已保存且已发布
2. 确认 Pet Context 的 Pet Input 已选择 `question`
3. 确认 Embedding Model 服务正常运行（`curl http://localhost:8081/health`）
4. 查看 Flowise server 日志中的 `[PetContext]` / `[PetCardRecaller]` 输出

### Q7: 如何调整自动技能绑定阈值？

```bash
PET_AUTO_BIND_THRESHOLD=0.8   # 默认 0.7，提高则绑定更严格
```

### Q8: SkillRouter 找不到技能时如何兜底？

在 agent 分支中，Agent 节点本身会在找不到合适工具时直接用自然语言回复，不会报错。

---

## 附录

### A. 环境变量

| 变量                      | 说明                           | 默认值                  |
| ------------------------- | ------------------------------ | ----------------------- |
| `BGE_EMBEDDING_URL`       | bge-small-zh 服务地址          | `http://localhost:8081` |
| `PET_TICK_INTERVAL_MIN`   | 后台 Tick 周期（分钟）         | 10                      |
| `PET_AUTO_BIND_THRESHOLD` | 自动技能绑定阈值               | 0.7                     |
| `FLOWISE_URL`             | 服务器内部地址（供 cron 调用） | `http://localhost:3000` |

### B. 相关文档

-   [Pet Agent 设计文档](./pet-agent-design.md)
-   [Schedule 节点使用指南](./schedule-node-usage.md)

### C. 新增节点一览（Phase 7+）

| 节点                 | 文件                        | 用途                               |
| -------------------- | --------------------------- | ---------------------------------- |
| Pet Context          | `Pet/PetContext.ts`         | 状态加载 + 6 路由分支              |
| Pet Card Recaller    | `Pet/PetCardRecaller.ts`    | card 向量召回 + system prompt 播种 |
| Pet Memory Retriever | `Pet/PetMemoryRetriever.ts` | 记忆检索 + system prompt 最终构建  |
| Pet State Updater    | `Pet/PetStateUpdater.ts`    | 消息保存 + 性格漂移 + 流式输出     |

---

**文档结束**。更新记录：

-   v1.0 (2026-04-21) 初版
-   v1.1 (2026-04-23) 新增 Phase 3 技能绑定系统
-   v1.2 (2026-05-11) 新增 Agentflow 组合模式（Phase 7+）完整画布配置说明
