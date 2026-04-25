# Pet 节点使用指南

**版本** v1.1 · **最后更新** 2026-04-23

> 本文档介绍如何在 Flowise AgentFlow 中使用 Pet 节点，构建一只会成长、会学习的 AI 宠物。

---

## 目录

-   [1. 快速开始](#1-快速开始)
-   [2. 节点配置](#2-节点配置)
-   [3. 教学系统](#3-教学系统)
-   [4. 成长阶段](#4-成长阶段)
-   [5. 个性系统](#5-个性系统)
-   [6. 技能系统](#6-技能系统)
    -   [6.1 技能解锁](#61-技能解锁)
    -   [6.2 意图-技能绑定](#62-意图-技能绑定)
    -   [6.3 SkillRouter 节点](#63-skillrouter-节点)
    -   [6.4 自动绑定机制](#64-自动绑定机制)
    -   [6.5 创建技能](#65-创建技能)
-   [7. API 接口](#7-api-接口)
-   [8. 常见问题](#8-常见问题)

---

## 1. 快速开始

### 1.1 前置条件

在使用 Pet 节点之前，需要部署 **bge-small-zh** 嵌入模型服务：

```bash
# 使用 Docker 部署 TEI 服务（CPU 版本）
docker run -d --name bge-small-zh \
  -p 8081:80 \
  -v D:\data\bge-cache:/data \
  ghcr.io/huggingface/text-embeddings-inference:cpu-latest \
  --model-id BAAI/bge-small-zh-v1.5
```

### 1.2 创建宠物

1. 在 Flowise 左侧菜单点击 **我的宠物**
2. 点击 **创建宠物** 按钮
3. 填写宠物名称和语言
4. 点击保存

### 1.3 配置 AgentFlow

1. 新建一个 AgentFlow
2. 添加 **Start** 节点（起点）
3. 添加 **Pet** 节点
4. 添加 **DirectReply** 节点（终点）
5. 按顺序连线：`Start → Pet → DirectReply`

### 1.4 配置 Pet 节点输入

在 Pet 节点的 **Pet Input** 字段：

1. 点击输入框内部
2. 输入 `{{` 触发变量下拉
3. 选择 `question`（用户输入的问题）

### 1.5 配置 DirectReply 节点

在 DirectReply 节点的 **Message** 字段：

1. 点击输入框内部
2. 输入 `{{` 触发变量下拉
3. 选择 Pet 节点的输出（在 Node Outputs 分类下）

### 1.6 关联 AgentFlow

1. 回到 **我的宠物** 页面
2. 点击宠物卡片上的 **关联 AgentFlow** 按钮
3. 选择刚才创建的 AgentFlow
4. 保存

现在你可以开始和宠物聊天了！

---

## 2. 节点配置

### 2.1 Pet 节点参数

| 参数                | 类型   | 必填 | 说明                                     |
| ------------------- | ------ | ---- | ---------------------------------------- |
| **Embedding Model** | 选择   | ✅   | 嵌入模型，推荐使用 BgeSmallZhEmbeddings  |
| **Chat Model**      | 选择   | ❌   | 对话模型，用于 echo 阶段及以上的对话生成 |
| **User ID**         | 字符串 | ❌   | 用户标识，用于区分不同用户的宠物         |
| **Pet Input**       | 字符串 | ✅   | 用户输入的消息内容                       |

### 2.2 Embedding Model 配置

使用 **BGE-small-zh Embeddings** 节点：

| 参数             | 说明         | 默认值                  |
| ---------------- | ------------ | ----------------------- |
| **Endpoint**     | TEI 服务地址 | `http://localhost:8081` |
| **Batch Size**   | 批处理大小   | 32                      |
| **Timeout (ms)** | 超时时间     | 30000                   |

### 2.3 Chat Model 配置

推荐使用 **ChatGLM** 节点：

| 参数            | 说明                         |
| --------------- | ---------------------------- |
| **Model**       | 模型名称，推荐 `glm-4-flash` |
| **Temperature** | 温度参数，建议 0.7-0.9       |
| **Max Tokens**  | 最大输出 token 数            |

---

## 3. 教学系统

### 3.1 卡片类型

Pet 通过"喂卡片"学习，卡片分为三种类型：

| 类型       | 说明               | 示例                          |
| ---------- | ------------------ | ----------------------------- |
| **vocab**  | 词汇卡片，学习单词 | `跟我读:你好`                 |
| **phrase** | 短语卡片，学习句式 | `跟我学:看到妈妈说"妈妈你好"` |
| **action** | 动作卡片，学习行为 | `教你做:听到"玩"就 play`      |

### 3.2 教学指令格式

#### 中文指令

| 指令格式            | 卡片类型 | 说明                   |
| ------------------- | -------- | ---------------------- |
| `跟我读:XXX`        | vocab    | 教宠物说词汇           |
| `跟我学:XXX说"YYY"` | phrase   | 教宠物在情境下的回应   |
| `记住:XXX=>YYY`     | phrase   | 教宠物输入输出对应     |
| `教你做:XXX就YYY`   | action   | 教宠物在情境下执行动作 |

#### 英文指令

| 指令格式                    | 卡片类型 | 说明                 |
| --------------------------- | -------- | -------------------- |
| `repeat after me: XXX`      | vocab    | 教宠物说词汇         |
| `learn: say "XXX" when YYY` | phrase   | 教宠物在情境下的回应 |

### 3.3 喂卡片操作

1. 在宠物页面点击 **喂卡片** 按钮
2. 选择卡片类型（词汇/短语/动作）
3. 填写输入和输出内容
4. 点击保存

### 3.4 启蒙包导入

系统内置三个启蒙包，可在创建宠物时自动导入：

| 启蒙包                   | 语言 | 内容             |
| ------------------------ | ---- | ---------------- |
| `starter-zh.json`        | 中文 | 100 词 + 30 行动 |
| `starter-en.json`        | 英文 | 100 词 + 30 行动 |
| `starter-bilingual.json` | 双语 | 200 词 + 60 行动 |

---

## 4. 成长阶段

宠物通过积累卡片数量成长，每个阶段有不同的能力：

| 阶段          | 条件         | 输出策略                    | 解锁能力        |
| ------------- | ------------ | --------------------------- | --------------- |
| 🥚 **egg**    | 0 张卡       | 原始音（`.../?/~/咕`）      | 仅学习指令      |
| 🐣 **babble** | 1-19 张卡    | RAG 匹配或原始音            | 学习、简单回应  |
| 👶 **echo**   | 20-99 张卡   | LLM + 词汇白名单 + few-shot | 以上 + 意图识别 |
| 🧒 **talk**   | 100-499 张卡 | 完整 LLM + 个性叙事         | 以上 + 手动技能 |
| 🧑 **mature** | 500+ 张卡    | 完整 LLM，个性主导          | 全部 + 自动技能 |

### 4.1 阶段特点

-   **egg 阶段**：宠物刚出生，只会发出原始声音
-   **babble 阶段**：开始模仿学到的词汇
-   **echo 阶段**：能用 LLM 生成简单回应
-   **talk 阶段**：具备完整对话能力，开始形成个性
-   **mature 阶段**：个性成熟，可自动解锁技能

---

## 5. 个性系统

### 5.1 性格维度

宠物有 8 个性格维度，通过喂卡片逐步形成：

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

### 5.2 traitTags 标签

喂卡片时可以添加 traitTags 影响性格：

```
playful      → 玩心强
affectionate → 温和
curious      → 好奇
shy          → 内向
brave        → 勇敢
friendly     → 友善
serious      → 严肃
creative     → 创意
```

### 5.3 个性叙事

当宠物成长到一定阶段，系统会自动生成个性叙事描述：

-   每 50 张卡片重新计算
-   使用 LLM 生成 200 字以内的性格描述
-   用于对话中的 system prompt

---

## 6. 技能系统

### 6.1 技能解锁

宠物达到 **talk 阶段**（100+ 张卡）后可以绑定技能：

-   **手动绑定**：在宠物页面手动关联技能
-   **自动绑定**：达到 **mature 阶段**（500+ 张卡）后，根据性格自动匹配

### 6.2 意图-技能绑定

Phase 3 引入了 **IntentSkillBinding** 实体，用于管理宠物的意图-技能映射关系：

| 字段            | 类型     | 说明                                        |
| --------------- | -------- | ------------------------------------------- |
| `id`            | UUID     | 绑定记录 ID                                 |
| `petId`         | string   | 宠物 ID                                     |
| `intent`        | string   | 意图标签（如 `weather`、`music`）           |
| `skillToolId`   | string   | 关联的 Tool ID                              |
| `source`        | string   | 绑定来源：`manual`（手动）或 `auto`（自动） |
| `autoBindScore` | float    | 自动绑定时计算的余弦相似度分数              |
| `priority`      | int      | 优先级，数值越大优先级越高（默认 0）        |
| `createdDate`   | datetime | 创建时间                                    |
| `updatedDate`   | datetime | 更新时间                                    |

**绑定规则**：

-   每个 `(petId, intent)` 组合唯一，不能重复绑定
-   同一意图可以绑定到不同宠物的不同技能
-   自动绑定的分数必须超过阈值（默认 0.7）

### 6.3 SkillRouter 节点

**SkillRouter** 是 AgentFlow 中的路由节点，用于根据意图查找绑定的技能：

#### 节点参数

| 参数       | 类型   | 必填 | 说明                              |
| ---------- | ------ | ---- | --------------------------------- |
| **Pet ID** | string | ✅   | 宠物 ID，用于查询该宠物的技能绑定 |
| **Intent** | string | ✅   | 意图标签，从 Pet 节点输出中提取   |

#### 使用流程

```
Start → Pet → SkillRouter → [If Tool Exists] → Tool Execution → DirectReply
                              ↓
                         [If No Tool] → DirectReply (fallback)
```

#### 节点输出

```json
{
    "tool": {
        "id": "tool-uuid",
        "name": "weatherSkill",
        "description": "查询天气",
        "func": "// @openclaw-meta:{...}\n..."
    },
    "bindingId": "binding-uuid",
    "source": "auto"
}
```

如果未找到匹配的技能，`tool` 为 `null`。

#### 示例 AgentFlow 配置

1. **Start** 节点：接收用户输入
2. **Pet** 节点：处理对话，输出意图识别结果
3. **SkillRouter** 节点：
    - Pet ID: `{{pet.id}}`
    - Intent: `{{pet.output.intent}}`
4. **If** 节点：判断 `{{skillRouter.output.tool}}` 是否存在
5. **Tool** 节点：执行匹配到的技能
6. **DirectReply** 节点：返回结果

### 6.4 自动绑定机制

**SkillAutoBinder** 是一个后台定时任务，每小时运行一次，自动为宠物绑定匹配的技能。

#### 工作原理

1. 加载所有宠物和带有 Phase 3 元数据的技能工具
2. 对每个宠物：
    - 检查成长等级是否满足技能的 `minLevel` 要求
    - 计算宠物性格向量与技能 `personalityProfile` 的余弦相似度
    - 如果相似度 > 阈值（0.7），创建自动绑定记录

#### 余弦相似度计算

```typescript
function cosineSim(a: number[], b: number[]): number {
    const len = Math.min(a.length, b.length)
    let dot = 0,
        magA = 0,
        magB = 0
    for (let i = 0; i < len; i++) {
        dot += a[i] * b[i]
        magA += a[i] * a[i]
        magB += b[i] * b[i]
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}
```

#### 自动绑定条件

| 条件              | 说明                                         |
| ----------------- | -------------------------------------------- |
| `petLevel`        | 必须 >= 技能的 `minLevel`                    |
| `boundIntents`    | 技能必须定义了至少一个意图标签               |
| `cosineSim`       | 必须 > `PET_AUTO_BIND_THRESHOLD`（默认 0.7） |
| `existingBinding` | 该宠物的该意图尚未绑定其他技能               |

#### 日志输出

```
[SkillAutoBinder] Auto-bound skill "weatherSkill" → pet abc123 intent="weather" score=0.856
[SkillAutoBinder] Run complete — 3 new binding(s) created
```

### 6.5 创建技能

技能使用 **OpenClaw Manifest** 格式定义，Phase 3 扩展了以下字段：

#### OpenClaw Manifest 完整格式

```typescript
interface OpenClawManifest {
    name: string // 技能名称
    version?: string // 版本号
    description: string // 描述
    iconUrl?: string // 图标 URL
    type: 'api' | 'code' | 'llm' | 'python' // 技能类型
    inputs: OpenClawSkillInput[] // 输入参数
    entry?: string // 入口文件（code/python 类型）
    entryContent?: string // 入口代码内容
    config?: object // 配置（根据类型不同）

    // Phase 3 扩展字段
    personalityProfile?: number[] // 性格向量，8 维数组
    minLevel?: number // 最低解锁等级
    boundIntents?: string[] // 绑定的意图标签列表
}
```

#### 示例：天气技能

```json
{
    "name": "weatherSkill",
    "version": "1.0.0",
    "description": "Query current weather and forecast for a given city",
    "type": "api",
    "inputs": [
        {
            "property": "city",
            "type": "string",
            "description": "City name to query weather for",
            "required": true
        },
        {
            "property": "unit",
            "type": "string",
            "description": "Temperature unit: 'celsius' or 'fahrenheit'",
            "required": false
        }
    ],
    "config": {
        "url": "https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true",
        "method": "GET"
    },
    "personalityProfile": [0.1, -0.5, 0.0, 0.7, 0.0, 0.0, 0.3, 0.2],
    "minLevel": 5,
    "boundIntents": ["weather", "forecast", "temperature"]
}
```

#### 元数据嵌入

当技能通过 OpenClaw 适配器创建时，Phase 3 元数据会自动嵌入到 Tool 的 `func` 字段顶部：

```javascript
// @openclaw-meta:{"personalityProfile":[0.1,-0.5,0,0.7,0,0,0.3,0.2],"minLevel":5,"boundIntents":["weather","forecast","temperature"]}
async function weatherSkill(city, unit = 'celsius') {
    // ... skill implementation
}
```

SkillAutoBinder 通过解析 `func` 字段的第一行来获取元数据。

---

## 7. API 接口

### 7.1 获取宠物列表

```http
GET /api/v1/pet
```

### 7.2 创建宠物

```http
POST /api/v1/pet
Content-Type: application/json

{
    "name": "小黄",
    "language": "zh"
}
```

### 7.3 获取宠物详情

```http
GET /api/v1/pet/:petId
```

### 7.4 喂卡片

```http
POST /api/v1/pet/:petId/cards
Content-Type: application/json

{
    "cardType": "vocab",
    "input": "你好",
    "output": "你好",
    "traitTags": ["friendly"]
}
```

### 7.5 与宠物对话

```http
POST /api/v1/prediction/:flowId
Content-Type: application/json

{
    "question": "你好呀",
    "overrideConfig": {
        "petUserId": "user-123"
    }
}
```

### 7.6 获取技能绑定列表

```http
GET /api/v1/pets/:petId/skill-bindings
```

**响应示例**：

```json
[
    {
        "id": "binding-uuid-1",
        "petId": "pet-uuid",
        "intent": "weather",
        "skillToolId": "tool-uuid",
        "source": "auto",
        "autoBindScore": 0.856,
        "priority": 0,
        "createdDate": "2026-04-23T10:00:00Z",
        "updatedDate": "2026-04-23T10:00:00Z"
    },
    {
        "id": "binding-uuid-2",
        "petId": "pet-uuid",
        "intent": "music",
        "skillToolId": "tool-uuid-2",
        "source": "manual",
        "autoBindScore": null,
        "priority": 10,
        "createdDate": "2026-04-23T11:00:00Z",
        "updatedDate": "2026-04-23T11:00:00Z"
    }
]
```

### 7.7 创建技能绑定

```http
POST /api/v1/pets/:petId/skill-bindings
Content-Type: application/json

{
    "intent": "weather",
    "skillToolId": "tool-uuid",
    "priority": 5
}
```

**响应示例**：

```json
{
    "id": "binding-uuid",
    "petId": "pet-uuid",
    "intent": "weather",
    "skillToolId": "tool-uuid",
    "source": "manual",
    "autoBindScore": null,
    "priority": 5,
    "createdDate": "2026-04-23T12:00:00Z",
    "updatedDate": "2026-04-23T12:00:00Z"
}
```

**错误响应**：

-   `400` - 缺少必填字段（intent 或 skillToolId）
-   `409` - 该意图已绑定其他技能

### 7.8 删除技能绑定

```http
DELETE /api/v1/pets/:petId/skill-bindings/:bindingId
```

**响应示例**：

```json
{
    "message": "Binding deleted"
}
```

**错误响应**：

-   `404` - 绑定记录不存在

---

## 8. 常见问题

### Q1: 宠物不回复怎么办？

检查以下几点：

1. AgentFlow 是否正确配置并关联
2. Pet 节点的输入是否正确绑定 `{{question}}`
3. DirectReply 节点是否正确绑定 Pet 输出
4. Embedding Model 服务是否正常运行

### Q2: 如何让宠物学习更快？

-   使用启蒙包导入基础词汇
-   多喂不同类型的卡片
-   在卡片中添加 traitTags 影响性格

### Q3: 宠物性格可以改变吗？

可以。性格由卡片累积决定：

-   继续喂带有不同 traitTags 的卡片
-   每 50 张卡片会重新计算性格向量

### Q4: 如何添加新技能？

1. 在 Tools 页面创建新工具
2. 在宠物页面点击"关联技能"
3. 选择要绑定的意图和工具

或使用 API 创建绑定：

```bash
curl -X POST http://localhost:3000/api/v1/pets/{petId}/skill-bindings \
  -H "Content-Type: application/json" \
  -d '{"intent": "weather", "skillToolId": "tool-uuid"}'
```

### Q5: 支持多语言吗？

支持。创建宠物时选择语言：

-   `zh` - 中文
-   `en` - 英文
-   `mixed` - 双语混合

### Q6: 自动绑定的技能可以删除吗？

可以。自动绑定的技能（`source: "auto"`）和手动绑定的一样，都可以通过 API 或 UI 删除。

### Q7: 如何调整自动绑定阈值？

通过环境变量设置：

```bash
PET_AUTO_BIND_THRESHOLD=0.8
```

默认值为 `0.7`。提高阈值会减少自动绑定数量，降低阈值会增加。

### Q8: SkillRouter 找不到技能怎么办？

SkillRouter 返回 `tool: null` 时，可以使用 If 节点判断并提供 fallback 回复：

```
If {{skillRouter.output.tool}} === null
  → DirectReply: "我还没学会这个技能呢，教教我吧！"
Else
  → 执行技能
```

---

## 附录

### A. 环境变量配置

| 变量                      | 说明                   | 默认值                  |
| ------------------------- | ---------------------- | ----------------------- |
| `BGE_EMBEDDING_URL`       | bge-small-zh 服务地址  | `http://localhost:8081` |
| `PET_TICK_INTERVAL_MIN`   | 后台 Tick 周期（分钟） | 10                      |
| `PET_AUTO_BIND_THRESHOLD` | 自动技能绑定阈值       | 0.7                     |

### B. 相关文档

-   [Pet Agent 设计文档](./pet-agent-design.md)
-   [Schedule 节点使用指南](./schedule-node-usage.md)

### C. 数据库迁移

Phase 3 新增 `intent_skill_binding` 表，迁移文件：

-   `1769300000000-AddIntentSkillBinding.ts`（sqlite/mysql/mariadb/postgres）

---

**文档结束**。更新记录：

-   v1.1 (2026-04-23) 新增 Phase 3 技能绑定系统：IntentSkillBinding、SkillRouter、SkillAutoBinder、API 接口
-   v1.0 (2026-04-21) 初版
