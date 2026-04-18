# Flowise 中文文档

> 基于 [FlowiseAI/Flowise](https://github.com/FlowiseAI/Flowise) 二次开发，可视化构建 AI 智能体。

## 目录

-   [快速开始](#快速开始)
-   [Docker 部署](#docker-部署)
-   [开发者指南](#开发者指南)
-   [项目结构](#项目结构)
-   [环境变量](#环境变量)
-   [文档](#文档)

---

## 快速开始

安装 [NodeJS](https://nodejs.org/en/download) >= 18.15.0，然后执行：

```bash
npm install -g flowise
npx flowise start
```

访问 [http://localhost:3000](http://localhost:3000)

---

## Docker 部署

### Docker Compose

```bash
git clone https://github.com/FlowiseAI/Flowise.git
cd Flowise/docker
cp .env.example .env        # 按需修改环境变量
docker compose up -d
```

访问 [http://localhost:3000](http://localhost:3000)，停止服务：`docker compose stop`

### 手动构建镜像

```bash
docker build --no-cache -t flowise .
docker run -d --name flowise -p 3000:3000 flowise
docker stop flowise
```

---

## 开发者指南

### 前置条件

```bash
npm i -g pnpm
```

### 本地开发

```bash
git clone https://github.com/FlowiseAI/Flowise.git
cd Flowise
pnpm install        # 安装所有子包依赖
pnpm build          # 构建全部模块
pnpm start          # 启动生产服务 http://localhost:3000
```

> 如果构建时出现 `Exit code 134 (JavaScript heap out of memory)`，请先执行：
>
> ```bash
> export NODE_OPTIONS="--max-old-space-size=4096"   # macOS/Linux/Git Bash
> $env:NODE_OPTIONS="--max-old-space-size=4096"      # Windows PowerShell
> ```

### 热更新开发模式

```bash
# packages/ui/.env     设置 VITE_PORT
# packages/server/.env 设置 PORT
pnpm dev              # 启动开发服务 http://localhost:8080，代码改动自动热更新
```

---

## 项目结构

```
Flowise/                                  # 项目根目录（Monorepo）
├── packages/                             # 各子包
│   ├── server/                           # 后端服务（Node.js + Express）
│   │   └── src/
│   │       ├── index.ts                  # 应用入口，启动 HTTP 服务
│   │       ├── AppConfig.ts              # 应用全局配置
│   │       ├── DataSource.ts             # TypeORM 数据源配置
│   │       ├── Interface.ts              # 核心公共类型定义
│   │       ├── Interface.DocumentStore.ts# 文档存储相关类型
│   │       ├── Interface.Evaluation.ts   # 评估/评测相关类型
│   │       ├── Interface.Metrics.ts      # 指标监控相关类型
│   │       ├── NodesPool.ts              # 节点插件池，管理已加载的节点
│   │       ├── CachePool.ts              # 缓存池管理
│   │       ├── AbortControllerPool.ts    # 请求取消控制器池
│   │       ├── IdentityManager.ts        # 身份/租户管理
│   │       ├── UsageCacheManager.ts      # 用量缓存管理
│   │       ├── StripeManager.ts          # Stripe 计费集成
│   │       ├── controllers/              # 路由控制器（按功能模块划分）
│   │       │   ├── chatflows/            # 聊天流 CRUD
│   │       │   ├── credentials/          # 凭证管理
│   │       │   ├── chatflows/            # 对话流
│   │       │   ├── documentstore/        # 文档存储
│   │       │   ├── evaluations/          # 评测任务
│   │       │   ├── evaluators/           # 评测器
│   │       │   ├── executions/           # 执行记录
│   │       │   ├── apikey/               # API 密钥
│   │       │   ├── assistants/           # AI 助手
│   │       │   ├── dataset/              # 数据集
│   │       │   └── ...                   # 其他控制器
│   │       ├── services/                 # 业务逻辑层（对应 controllers）
│   │       │   ├── chatflows/            # 聊天流业务逻辑
│   │       │   ├── credentials/          # 凭证业务逻辑
│   │       │   ├── documentstore/        # 文档存储业务逻辑
│   │       │   ├── evaluations/          # 评测业务逻辑
│   │       │   ├── leads/                # 线索管理
│   │       │   ├── log/                  # 日志服务
│   │       │   └── ...                   # 其他服务
│   │       ├── database/
│   │       │   ├── entities/             # TypeORM 实体（数据表映射）
│   │       │   └── migrations/           # 数据库迁移文件
│   │       ├── routes/                   # Express 路由注册
│   │       ├── middlewares/              # 中间件（认证、限流等）
│   │       ├── errors/                   # 自定义错误类
│   │       ├── queue/                    # 任务队列（Bull/BullMQ）
│   │       ├── metrics/                  # Prometheus 指标采集
│   │       ├── enterprise/               # 企业版功能（RBAC、SSO 等）
│   │       ├── commands/                 # CLI 命令
│   │       └── utils/                    # 后端工具函数
│   │
│   ├── ui/                               # 前端（React + Vite）
│   │   └── src/
│   │       ├── index.jsx                 # React 应用入口
│   │       ├── App.jsx                   # 根组件，路由挂载
│   │       ├── config.js                 # 前端配置常量
│   │       ├── routes/                   # 页面路由定义
│   │       ├── layout/                   # 全局布局（侧边栏、顶栏）
│   │       ├── menu-items/               # 导航菜单配置
│   │       ├── views/                    # 页面级组件
│   │       │   ├── agentflows/           # AgentFlow 列表页
│   │       │   ├── agentflowsv2/         # AgentFlow v2 列表页
│   │       │   ├── canvas/               # 可视化画布（拖拽编排）
│   │       │   ├── chatflows/            # 聊天流列表页
│   │       │   ├── chatbot/              # 嵌入式聊天窗口
│   │       │   ├── chatmessage/          # 对话消息历史
│   │       │   ├── credentials/          # 凭证管理页
│   │       │   ├── apikey/               # API 密钥管理页
│   │       │   ├── assistants/           # AI 助手管理页
│   │       │   ├── tools/                # 自定义工具页
│   │       │   ├── docstore/             # 文档存储页
│   │       │   ├── datasets/             # 数据集管理页
│   │       │   ├── evaluations/          # 评测任务页
│   │       │   ├── evaluators/           # 评测器管理页
│   │       │   ├── marketplaces/         # 模板市场页
│   │       │   ├── vectorstore/          # 向量数据库管理页
│   │       │   ├── variables/            # 环境变量管理页
│   │       │   ├── users/                # 用户管理页
│   │       │   ├── roles/                # 角色权限页
│   │       │   ├── workspace/            # 工作空间管理页
│   │       │   ├── organization/         # 组织管理页
│   │       │   ├── auth/                 # 登录/注册/重置密码页
│   │       │   ├── settings/             # 系统设置页
│   │       │   ├── serverlogs/           # 服务端日志查看页
│   │       │   ├── files/                # 文件管理页
│   │       │   └── account/              # 账户设置页
│   │       ├── store/                    # Redux 全局状态管理
│   │       ├── hooks/                    # 自定义 React Hooks
│   │       ├── api/                      # 前端 API 请求封装
│   │       ├── i18n/                     # 国际化（中英文）
│   │       ├── themes/                   # MUI 主题配置
│   │       ├── ui-component/             # 通用 UI 组件库
│   │       ├── utils/                    # 前端工具函数
│   │       └── assets/                   # 静态资源（图标、图片）
│   │
│   ├── components/                       # 节点插件包（LangChain 集成）
│   │   ├── nodes/                        # 所有可用节点按类型分目录
│   │   │   ├── chatmodels/               # 聊天模型（OpenAI、Claude、GLM 等）
│   │   │   ├── llms/                     # 文本补全 LLM
│   │   │   ├── embeddings/               # 向量嵌入模型
│   │   │   ├── vectorstores/             # 向量数据库（Pinecone、Chroma 等）
│   │   │   ├── documentloaders/          # 文档加载器（PDF、网页、数据库等）
│   │   │   ├── textsplitters/            # 文本分割器
│   │   │   ├── memory/                   # 对话记忆组件
│   │   │   ├── chains/                   # LangChain 链
│   │   │   ├── agents/                   # 智能体（ReAct、OpenAI Functions 等）
│   │   │   ├── tools/                    # 工具节点（搜索、代码执行等）
│   │   │   ├── prompts/                  # 提示词模板节点
│   │   │   ├── outputparsers/            # 输出解析器
│   │   │   ├── retrievers/               # 检索器
│   │   │   ├── cache/                    # 缓存节点
│   │   │   ├── moderation/               # 内容审核节点
│   │   │   ├── multiagents/              # 多智能体节点
│   │   │   ├── sequentialagents/         # 顺序执行智能体节点
│   │   │   ├── agentflow/                # AgentFlow 专用节点
│   │   │   ├── graphs/                   # 图结构节点
│   │   │   ├── analytic/                 # 分析追踪节点（LangSmith 等）
│   │   │   ├── recordmanager/            # 文档记录管理节点
│   │   │   ├── responsesynthesizer/      # 响应合成节点
│   │   │   ├── speechtotext/             # 语音转文字节点
│   │   │   ├── engine/                   # 执行引擎节点
│   │   │   └── utilities/                # 通用工具节点
│   │   ├── credentials/                  # 凭证定义（各平台 API Key 结构）
│   │   └── src/                          # 组件包核心逻辑
│   │       ├── index.ts                  # 导出所有节点
│   │       ├── handler.ts                # 节点执行处理器
│   │       ├── agents.ts                 # 智能体通用逻辑
│   │       ├── indexing.ts               # 向量索引逻辑
│   │       ├── modelLoader.ts            # 模型动态加载
│   │       ├── multiModalUtils.ts        # 多模态工具函数
│   │       ├── speechToText.ts           # 语音识别封装
│   │       ├── textToSpeech.ts           # 语音合成封装
│   │       ├── utils.ts                  # 通用工具函数
│   │       ├── validator.ts              # 输入校验
│   │       ├── httpSecurity.ts           # HTTP 安全工具
│   │       └── storage/                  # 文件存储适配器
│   │
│   ├── agentflow/                        # AgentFlow 前端 SDK 包
│   │   └── src/
│   │       ├── index.ts                  # 包导出入口
│   │       ├── Agentflow.tsx             # 核心 AgentFlow 组件
│   │       ├── AgentflowProvider.tsx     # Context Provider
│   │       ├── useAgentflow.ts           # 主 Hook（状态与操作）
│   │       ├── atoms/                    # Jotai 原子状态
│   │       ├── core/                     # 核心引擎逻辑
│   │       ├── features/                 # 功能模块（节点、边、面板等）
│   │       ├── infrastructure/           # 基础设施（API、存储）
│   │       └── i18n/                     # 国际化资源
│   │
│   └── api-documentation/               # Swagger API 文档（自动生成）
│
├── docker/                              # Docker 相关配置
│   ├── docker-compose.yml               # 标准部署（单机）
│   ├── docker-compose-queue-source.yml  # 队列模式（源码构建）
│   ├── docker-compose-queue-prebuilt.yml# 队列模式（预构建镜像）
│   └── worker/                          # 队列 Worker 配置
│
├── i18n/                                # 根级国际化资源
├── images/                              # 文档用图片
├── metrics/                             # 监控指标配置（Prometheus/Grafana）
├── assets/                              # 全局静态资源
│
├── Dockerfile                           # 生产镜像构建文件
├── pnpm-workspace.yaml                  # PNPM Monorepo 工作空间配置
├── turbo.json                           # Turborepo 构建管道配置
├── package.json                         # 根包配置（全局脚本）
├── pnpm-lock.yaml                       # 依赖锁定文件
├── .eslintrc.js                         # ESLint 代码规范配置
├── .dockerignore                        # Docker 构建忽略文件
├── CONTRIBUTING.md                      # 贡献指南
├── SECURITY.md                          # 安全漏洞报告指南
└── LICENSE.md                           # Apache 2.0 开源协议
```

---

## 环境变量

在 `packages/server` 下创建 `.env` 文件（参考 `.env.example`）：

| 变量名              | 说明                                            | 默认值               |
| ------------------- | ----------------------------------------------- | -------------------- |
| `PORT`              | 服务监听端口                                    | `3000`               |
| `DATABASE_TYPE`     | 数据库类型（`sqlite` / `mysql` / `postgres`）   | `sqlite`             |
| `DATABASE_PATH`     | SQLite 数据库路径                               | `~/.flowise`         |
| `APIKEY_PATH`       | API Key 存储路径                                | `~/.flowise`         |
| `SECRETKEY_PATH`    | 加密密钥存储路径                                | `~/.flowise`         |
| `LOG_LEVEL`         | 日志级别（`error` / `warn` / `info` / `debug`） | `info`               |
| `LOG_PATH`          | 日志文件路径                                    | `~/.flowise/logs`    |
| `BLOB_STORAGE_PATH` | 文件上传存储路径                                | `~/.flowise/storage` |
| `FLOWISE_USERNAME`  | 登录用户名（启用认证）                          | —                    |
| `FLOWISE_PASSWORD`  | 登录密码（启用认证）                            | —                    |

在 `packages/ui` 下创建 `.env` 文件：

| 变量名          | 说明             | 默认值                  |
| --------------- | ---------------- | ----------------------- |
| `VITE_PORT`     | 前端开发服务端口 | `8080`                  |
| `VITE_API_HOST` | 后端 API 地址    | `http://localhost:3000` |

---

## 文档

-   官方文档：[https://docs.flowiseai.com](https://docs.flowiseai.com)
-   API 文档：启动服务后访问 `http://localhost:3000/api-docs`

---

## 许可证

本项目代码基于 [Apache License Version 2.0](LICENSE.md) 开源。
