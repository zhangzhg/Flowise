# Pet Agent System — 完整文档

**版本** v2.0 · **最后更新** 2026-05-13

> 本文档整合了 Pet 系统的设计理念与使用指南，帮助你在 Flowise AgentFlow 中构建一只会成长、会学习的 AI 宠物。

---

## 目录

-   [1. 概述](#1-概述)
    -   [1.1 背景](#11-背景)
    -   [1.2 核心目标](#12-核心目标)
    -   [1.3 术语表](#13-术语表)
-   [2. 快速开始](#2-快速开始)
    -   [2.1 前置条件](#21-前置条件)
    -   [2.2 创建宠物](#22-创建宠物)
    -   [2.3 选择配置模式](#23-选择配置模式)
-   [3. 系统架构](#3-系统架构)
    -   [3.1 总架构图](#31-总架构图)
    -   [3.2 插件化架构](#32-插件化架构)
    -   [3.3 安装插件](#33-安装插件)
    -   [3.4 模块职责](#34-模块职责)
    -   [3.5 数据模型](#35-数据模型)
-   [4. Agentflow 组合模式（推荐）](#4-agentflow-组合模式推荐)
    -   [4.1 架构概览](#41-架构概览)
    -   [4.2 节点总览与变量引用规则](#42-节点总览与变量引用规则)
    -   [4.3 节点逐一配置](#43-节点逐一配置)
    -   [4.4 连线检查清单](#44-连线检查清单)
    -   [4.5 overrideConfig 与 API 调用](#45-overrideconfig-与-api-调用)
    -   [4.6 绑定 Agentflow 到 Pet](#46-绑定-agentflow-到-pet)
    -   [4.7 快速验证](#47-快速验证)
-   [5. 经典聚合节点模式（PetCore）](#5-经典聚合节点模式petcore)
    -   [5.1 基本拓扑](#51-基本拓扑)
    -   [5.2 Pet 节点参数](#52-pet-节点参数)
    -   [5.3 Embedding Model 配置](#53-embedding-model-配置)
    -   [5.4 Chat Model 配置](#54-chat-model-配置)
-   [6. 核心领域模型](#6-核心领域模型)
    -   [6.1 成长阶段](#61-成长阶段)
    -   [6.2 个性系统](#62-个性系统)
    -   [6.3 属性系统](#63-属性系统)
-   [7. 教学系统](#7-教学系统)
    -   [7.1 卡片类型](#71-卡片类型)
    -   [7.2 教学指令格式](#72-教学指令格式)
    -   [7.3 启蒙包导入](#73-启蒙包导入)
    -   [7.4 卡片强化机制](#74-卡片强化机制)
-   [8. 技能系统](#8-技能系统)
    -   [8.1 技能绑定](#81-技能绑定)
    -   [8.2 自动解锁算法](#82-自动解锁算法)
-   [9. API 接口](#9-api-接口)
-   [10. 常见问题](#10-常见问题)

---

## 1. 概述

### 1.1 背景

在 Flowise 上构建一只"有成长记忆的 AI 宠物"：从完全白纸出生，通过用户喂食**卡片**学习词汇/动作/风格，逐步涌现个性；达到一定程度后自动匹配并装配技能，最终成长为带独立人格、可调用工具、具备皮肤与语音的智能体。

### 1.2 核心目标

| 目标                | 说明                                                        |
| ------------------- | ----------------------------------------------------------- |
| **G1 零基础成长**   | 新宠物除原始声外不会任何词；每一句话背后必有某张卡作为源头  |
| **G2 可解释的个性** | 个性 = 向量（实时）+ 叙事（周期）                           |
| **G3 能力动态扩展** | 复用 OpenClaw skill 包，等级/个性达标后自动装配             |
| **G4 低成本**       | embedding 走本地 bge-small-zh HTTP 服务，LLM 走 GLM-4-flash |
| **G5 全节点化**     | 所有业务和 provider 都是 Flowise 节点，AgentFlow 可视化组合 |
| **G6 多模态**       | 可选挂语音输入/输出节点                                     |

### 1.3 术语表

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

## 2. 快速开始

### 2.1 前置条件

部署 **bge-small-zh** 嵌入模型服务（二选一）：

```bash
# HuggingFace TEI（推荐）
docker run -d --name bge-small-zh \
  -p 8081:80 \
  -v D:\data\bge-cache:/data \
  ghcr.io/huggingface/text-embeddings-inference:cpu-latest \
  --model-id BAAI/bge-small-zh-v1.5
```

### 2.2 创建宠物

通过 API 创建宠物（或在 UI"我的宠物"页面操作）：

```http
POST /api/v1/pet/me
Content-Type: application/json

{ "name": "豆豆", "language": "zh" }
```

### 2.3 选择配置模式

| 模式                         | 适合场景                                     | 核心节点                                                            |
| ---------------------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| **Agentflow 组合模式**（§4） | 需要可视化扩展、添加自定义工具、调整分支逻辑 | PetContext + PetCardRecaller + PetMemoryRetriever + PetStateUpdater |
| **经典聚合模式**（§5）       | 快速上手，零配置                             | PetCore（单节点）                                                   |

---

## 3. 系统架构

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
  │ Entities  │   │   Plugin     │   │ Existing OpenClaw    │
  │ (TypeORM) │   │   Loader     │   │   Skill System       │
  └───────────┘   └──────────────┘   └──────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │  flowise-pet-nodes    │
              │     (Plugin)          │
              │                       │
              │  PetContext           │
              │  PetCardRecaller      │
              │  PetMemoryRetriever   │
              │  PetStateUpdater      │
              │  PetCardSaver         │
              └───────────────────────┘
                          │
      ┌───────────────────┼───────────────────┐
      ▼                   ▼                   ▼
   Provider 节点       Voice 节点          其他插件
   (BgeSmallZh/        (Whisper/          (可扩展...)
    ChatGLM/             OpenAITTS...)
    CustomHttp...)
```

### 3.2 插件化架构

Pet 系统采用**插件化架构**，核心节点通过 `flowise-pet-nodes` 插件提供：

| 插件信息       | 值                                                                             |
| -------------- | ------------------------------------------------------------------------------ |
| **插件名**     | `flowise-pet-nodes`                                                            |
| **版本**       | 1.0.0                                                                          |
| **位置**       | `packages/flowise-pet-nodes/`                                                  |
| **提供的节点** | PetContext, PetCardRecaller, PetMemoryRetriever, PetStateUpdater, PetCardSaver |

### 3.3 安装插件

#### 方式一：通过 UI 安装

1. 进入 Flowise 管理界面
2. 导航至 **Plugins** 页面
3. 点击 **Install Plugin**
4. 选择 `packages/flowise-pet-nodes` 目录或输入插件路径
5. 点击安装

#### 方式二：通过 API 安装

```http
POST /api/v1/plugins/install
Content-Type: application/json

{ "path": "d:\\workspace\\Flowise\\packages\\flowise-pet-nodes" }
```

### 3.4 模块职责

| 模块                 | 职责                                  | 关键目录                                                         |
| -------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| Entities             | 持久化 Pet/Card/Binding/Skin/EventLog | `packages/server/src/database/entities/Pet*.ts`                  |
| Services             | 业务：CRUD、卡片吸收、个性聚合        | `packages/server/src/services/pet/`                              |
| **Pet Nodes Plugin** | 宠物业务节点（插件形式）              | `packages/flowise-pet-nodes/src/nodes/`                          |
| Provider Nodes       | Embedding/LLM/Voice 节点              | `packages/components/nodes/embeddings/`, `chatmodels/`, `voice/` |
| Cron                 | 定时：Tick/Personality/SkillBind      | `packages/server/src/utils/pet/cron/`                            |
| UI                   | 宠物相关前端视图                      | `packages/ui/src/views/pet/`                                     |

### 3.5 数据模型

#### 3.5.1 实体关系

```
User ──1:1──► Pet ──1:N──► Card
                │
                ├─1:N──► IntentSkillBinding ──N:1──► Tool(OpenClaw)
                ├─1:N──► EventLog
                └─N:1──► Skin
```

#### 3.5.2 核心实体

**Pet 实体**：存储宠物基本信息、属性、性格向量、成长周期等。

**Card 实体**：存储教学卡片，包含类型、输入输出、向量嵌入、标签等。

**IntentSkillBinding 实体**：存储意图与技能的绑定关系。

**EventLog 实体**：记录宠物事件日志。

**Skin 实体**：存储皮肤配置（头像、色调、音色）。

---

## 4. Agentflow 组合模式（推荐）

### 4.1 架构概览

宠物的完整对话流程拆分为 6 个可视化分支，每个分支对应一种触发类型或成长阶段：

```
Start
  │
  ▼
Pet Context ─────────────────────────────────────────────────────
  │ (6输出)
  ├─ consolidate ─▶ DirectReply ("")
  │
  ├─ teach ──────▶ Pet Card Saver  ← 终止节点，自动返回学习确认
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

### 4.2 节点总览与变量引用规则

画布中每个节点被框架自动编号，格式为 `{节点名}_{index}`（从 0 计）：

| 节点                 | 类型名                        | 画布 ID（示例）                 | output.content                   |
| -------------------- | ----------------------------- | ------------------------------- | -------------------------------- |
| Pet Context          | `petContextAgentflow`         | `petContextAgentflow_0`         | egg→ 原始音；其他 →userText      |
| Pet Card Recaller    | `petCardRecallerAgentflow`    | `petCardRecallerAgentflow_0`    | babble→ 召回文本；其他 →userText |
| Pet Memory Retriever | `petMemoryRetrieverAgentflow` | `petMemoryRetrieverAgentflow_0` | **完整 system prompt**           |
| Pet Card Saver       | `petCardSaverAgentflow`       | `petCardSaverAgentflow_0`       | 学习确认消息                     |
| LLM                  | `llmAgentflow`                | `llmAgentflow_0`                | LLM 回复文本                     |
| Agent                | `agentAgentflow`              | `agentAgentflow_0`              | Agent 最终回复文本               |
| Pet State Updater    | `petStateUpdaterAgentflow`    | `petStateUpdaterAgentflow_0`    | 同 Reply 输入                    |
| DirectReply（多个）  | `directReplyAgentflow`        | `directReplyAgentflow_0/1/2…`   | —                                |

**如何引用变量**：在任意输入框中输入 `{{`，从弹出的 **Node Outputs** 下拉中选择对应节点，框架自动填入正确的 ID。

### 4.3 节点逐一配置

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
Pet Context (teach) ──▶ Pet Card Saver
```

**Pet Card Saver** 配置：

| 字段            | 配置值               | 说明                                 |
| --------------- | -------------------- | ------------------------------------ |
| Embedding Model | 选择嵌入模型（可选） | 推荐选择，为卡片生成向量以便后续召回 |

> Pet Card Saver 节点会自动从 flowState 读取解析后的教学数据，保存卡片到数据库，并返回确认消息。它是 teach 分支的终止节点，无需再连接 DirectReply。

**节点功能**：

-   自动解析 `parsedTeach` 数据
-   保存卡片到数据库（cardType、input、output、traitTags）
-   可选生成向量嵌入
-   自动更新宠物的 cardCount
-   返回学习确认消息（支持中英文）

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

### 4.4 连线检查清单

保存前逐项确认：

```
□ Start → Pet Context
□ Pet Context (consolidate) → DirectReply
□ Pet Context (teach) → Pet Card Saver
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

### 4.5 overrideConfig 与 API 调用

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

### 4.6 绑定 Agentflow 到 Pet

保存 Agentflow 后，将其 ID 写入 Pet 的 `petFlowId` 字段（`MemoryConsolidator` cron 需要此字段来触发后台记忆固化）：

```http
PUT /api/v1/pet/me
Content-Type: application/json

{ "petFlowId": "<chatflow-id>" }
```

### 4.7 快速验证

| 测试输入                                     | 期望走到的分支 | 期望输出                       |
| -------------------------------------------- | -------------- | ------------------------------ |
| 任意文字（新宠物，0 张卡）                   | egg            | `...?` / `咕~` 等原始音        |
| 任意文字（已有 5 张卡）                      | babble         | 召回卡片内容或原始音           |
| `跟我读:你好`                                | teach          | `好的，我记住了！学会了"你好"` |
| 任意文字（200+ turns）                       | llm            | LLM 生成，含记忆与性格         |
| 任意文字（500+ turns）                       | agent          | Agent ReAct，可使用工具        |
| `{"__consolidate__": true, "userId": "..."}` | consolidate    | 空回复，后台触发记忆固化       |

---

## 5. 经典聚合节点模式（PetCore）

适合快速上手，一个节点包含完整逻辑。

### 5.1 基本拓扑

```
Start → Pet → DirectReply
```

1. 新建 Agentflow，依次拖入 **Start**、**Pet**、**DirectReply**
2. 按顺序连线
3. Pet 节点 → **Pet Input** 字段 → 选择 `question`
4. DirectReply 节点 → **Message** 字段 → 选择 Pet 节点输出（`{{ petAgentflow_0 }}`）

### 5.2 Pet 节点参数

| 参数                | 类型   | 必填 | 说明                                   |
| ------------------- | ------ | ---- | -------------------------------------- |
| **Embedding Model** | 选择   | ✅   | 嵌入模型，推荐 BgeSmallZhEmbeddings    |
| **Chat Model**      | 选择   | ❌   | echo 阶段及以上必须，egg/babble 可省略 |
| **User ID**         | 字符串 | ❌   | 从 `overrideConfig.petUserId` 自动解析 |
| **Pet Input**       | 字符串 | ✅   | 选择 `question`                        |
| **Server Tools**    | 多选   | ❌   | mature 阶段可用的服务端工具            |

### 5.3 Embedding Model 配置

| 参数             | 说明         | 默认值                  |
| ---------------- | ------------ | ----------------------- |
| **Endpoint**     | TEI 服务地址 | `http://localhost:8081` |
| **Batch Size**   | 批处理大小   | 32                      |
| **Timeout (ms)** | 超时时间     | 30000                   |

### 5.4 Chat Model 配置

推荐 **ChatGLM** 节点（`glm-4-flash`，免费额度充足）：

| 参数        | 建议值        |
| ----------- | ------------- |
| Model       | `glm-4-flash` |
| Temperature | 0.7–0.9       |
| Max Tokens  | 2048          |

---

## 6. 核心领域模型

### 6.1 成长阶段

成长进度由**双轴**驱动：`progress = cardCount × 2 + chatTurns`

| 阶段          | progress 阈值 | 输出策略                                   | 可解锁能力      |
| ------------- | ------------- | ------------------------------------------ | --------------- |
| 🥚 **egg**    | 0–1           | 预设原始音随机（`.../?/~/咕`）             | 仅学习指令      |
| 🐣 **babble** | 2–39          | RAG top-1 cosine>0.8 直出，否则原始音      | 学习、简单回应  |
| 👶 **echo**   | 40–199        | 小 LLM + 词汇白名单 + top-5 few-shot       | 以上 + 意图识别 |
| 🧒 **talk**   | 200–499       | 完整 LLM + personalityNarrative + 记忆检索 | 以上 + 手动技能 |
| 🧑 **mature** | ≥500          | 完整 LLM，高自由度 + 工具调用              | 全部 + 自动技能 |

**设计理由**：纯卡片驱动会让高频对话用户进展过慢；双轴确保"积极训练 + 积极对话"都能推动成长，同时保留卡片 2× 权重体现"主动教学"的重要性。

### 6.2 个性系统

#### 6.2.1 性格维度（8 维向量）

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

**累加规则**：每次 CardIngestor → `vec += sum(tagVectors) * weight(cardType)` → L2 归一化。每 50 张卡重新从 0 算一次（防噪声放大）。

#### 6.2.2 Personality 双轨

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

### 6.3 属性系统

| 属性     | 范围     | 变化源                                         |
| -------- | -------- | ---------------------------------------------- |
| `mood`   | -100~100 | 卡片 stateDelta、响应情感、长期饥饿惩罚        |
| `hunger` | 0~100    | Tick +1/10min，吃 vocab 卡 -5，喂卡 -10        |
| `energy` | 0~100    | Tick -1/10min，chat -0.5，睡觉 intent 重置 100 |
| `level`  | 1~∞      | `level = floor(sqrt(exp/100))`                 |
| `exp`    | 0~∞      | 每张卡 +10，有效对话 +1                        |

---

## 7. 教学系统

### 7.1 卡片类型

| 类型       | 说明     | 示例                          |
| ---------- | -------- | ----------------------------- |
| **vocab**  | 词汇卡片 | `跟我读:你好`                 |
| **phrase** | 短语卡片 | `跟我学:看到妈妈说"妈妈你好"` |
| **action** | 动作卡片 | `教你做:听到"玩"就 play`      |

### 7.2 教学指令格式

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

### 7.3 启蒙包导入

内置三个启蒙包，创建宠物时可一键导入：

| 启蒙包                   | 语言 | 内容             |
| ------------------------ | ---- | ---------------- |
| `starter-zh.json`        | 中文 | 100 词 + 30 行动 |
| `starter-en.json`        | 英文 | 100 词 + 30 行动 |
| `starter-bilingual.json` | 双语 | 200 词 + 60 行动 |

### 7.4 卡片强化机制

重复投喂相同 `(input, output)` 组合时，旧卡片会被删除并重新插入（刷新 `createdDate`）。分数相近时，更新的卡片优先浮出，强化学习效果。

---

## 8. 技能系统

### 8.1 技能绑定

技能复用 OpenClaw skill 系统。`IntentSkillBinding` 实体存储意图与技能的绑定关系，`(petId, intent)` 唯一，优先 `priority` 高的。

### 8.2 自动解锁算法

**触发**：每小时 cron + 宠物升级事件。

算法逻辑：

1. 遍历所有带 `personalityProfile` 的技能
2. 检查宠物等级是否满足 `minLevel`
3. 计算性格向量相似度 `cosineSim(pet.personalityVector, skill.personalityProfile)`
4. 相似度超过阈值（默认 0.7）则自动绑定

---

## 9. API 接口

### 9.1 宠物管理

```http
# 创建宠物
POST /api/v1/pet/me
Content-Type: application/json
{ "name": "豆豆", "language": "zh" }

# 获取宠物信息
GET /api/v1/pet/me

# 更新宠物
PUT /api/v1/pet/me
Content-Type: application/json
{ "petFlowId": "<chatflow-id>" }
```

### 9.2 卡片管理

```http
# 添加卡片
POST /api/v1/pet/me/cards
Content-Type: application/json
{
  "cardType": "vocab",
  "input": "你好",
  "output": "你好",
  "traitTags": ["friendly"]
}

# 获取卡片列表
GET /api/v1/pet/me/cards

# 删除卡片
DELETE /api/v1/pet/me/cards/{cardId}
```

### 9.3 对话调用

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

---

## 10. 常见问题

### Q1: 为什么宠物一直输出原始音？

**原因**：宠物处于 egg 或 babble 阶段，且用户输入与已有卡片的相似度低于 0.8。

**解决**：通过教学指令添加更多卡片，或等待宠物成长到 echo 阶段。

### Q2: 如何让宠物使用工具？

**条件**：宠物需要达到 mature 阶段（progress ≥ 500）。

**操作**：在 Agentflow 的 agent 分支中连接 Tool 节点。

### Q3: 性格如何影响宠物行为？

性格向量会影响：

-   LLM system prompt 中的性格描述
-   技能自动解锁匹配
-   回复风格倾向

### Q4: 如何重置宠物？

```http
DELETE /api/v1/pet/me
```

删除后重新创建即可。

---

## 版本历史

-   v2.0 (2026-05-13) 合并 pet-node-usage.md 与 pet-agent-design.md，统一文档结构
-   v1.5 (2026-05-11) 基于 Agentflow 的 Pet 智能体化改造分析（Phase 7+）
-   v1.2 (2026-05-11) 新增 Agentflow 组合模式（Phase 7+）完整画布配置说明
