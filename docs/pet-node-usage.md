# Pet 节点使用指南

**版本** v1.0 · **最后更新** 2026-04-21

> 本文档介绍如何在 Flowise AgentFlow 中使用 Pet 节点，构建一只会成长、会学习的 AI 宠物。

---

## 目录

-   [1. 快速开始](#1-快速开始)
-   [2. 节点配置](#2-节点配置)
-   [3. 教学系统](#3-教学系统)
-   [4. 成长阶段](#4-成长阶段)
-   [5. 个性系统](#5-个性系统)
-   [6. 技能系统](#6-技能系统)
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

### 6.2 技能匹配规则

自动绑定基于性格向量相似度：

```
相似度 = cosine_similarity(pet.personalityVector, skill.personalityProfile)
如果 相似度 > 0.7，则自动绑定
```

### 6.3 创建技能

技能使用 OpenClaw 格式，扩展字段：

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

### Q5: 支持多语言吗？

支持。创建宠物时选择语言：

-   `zh` - 中文
-   `en` - 英文
-   `mixed` - 双语混合

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

---

**文档结束**。更新记录：

-   v1.0 (2026-04-21) 初版
