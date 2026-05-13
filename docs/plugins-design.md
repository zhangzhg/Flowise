# Flowise 插件系统设计文档

## 1. 概述

### 1.1 背景

Flowise 原有插件系统仅支持加载节点（Nodes）和凭证（Credentials），无法满足复杂业务模块（如 Pet）的完整插件化需求。本设计文档定义了一套完整的插件系统扩展方案，支持：

-   **节点 (Nodes)**: 自定义 AgentFlow 节点
-   **凭证 (Credentials)**: 自定义认证凭证类型
-   **实体 (Entities)**: 自定义数据库实体
-   **路由 (Routes)**: 自定义 REST API 端点
-   **权限 (Permissions)**: 自定义权限定义
-   **菜单项 (Menu Items)**: 自定义前端菜单
-   **钩子 (Hooks)**: 插件生命周期钩子
-   **国际化 (i18n)**: 多语言支持

### 1.2 设计目标

1. **模块化**: 支持将复杂业务模块完全抽取为独立插件
2. **热插拔**: 插件可在运行时安装、启用、禁用、卸载
3. **安全性**: 插件权限隔离，敏感操作需授权
4. **可扩展**: 支持未来扩展更多插件能力

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     Flowise Server                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │ NodesPool   │    │ PluginManager│    │ DataSource  │         │
│  │ (节点池)    │◄───│ (插件管理器) │───►│ (数据库)    │         │
│  └─────────────┘    └──────┬──────┘    └─────────────┘         │
│                            │                                     │
│                            ▼                                     │
│                   ┌─────────────────┐                           │
│                   │ PluginLoader    │                           │
│                   │ (插件加载器)    │                           │
│                   └────────┬────────┘                           │
│                            │                                     │
│         ┌──────────────────┼──────────────────┐                 │
│         ▼                  ▼                  ▼                 │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐            │
│  │ loadNodes  │    │loadEntities│    │loadRoutes  │            │
│  └────────────┘    └────────────┘    └────────────┘            │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Plugin Package                                │
├─────────────────────────────────────────────────────────────────┤
│  flowise-plugin.json  ←──────────────────────────────────────┐  │
│  package.json                                                 │  │
│  src/                                                         │  │
│  ├── nodes/          → AgentFlow 节点                        │  │
│  ├── credentials/    → 认证凭证类型                          │  │
│  ├── entities/       → TypeORM 数据库实体                    │  │
│  ├── routes/         → Express REST API                      │  │
│  ├── hooks/          → 生命周期钩子                          │  │
│  │   ├── onLoad.ts   → 插件启用时执行                        │  │
│  │   └── onUnload.ts → 插件禁用时执行                        │  │
│  └── i18n/locales/   → 国际化翻译文件                        │  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 核心组件

| 组件            | 职责                                       |
| --------------- | ------------------------------------------ |
| `PluginManager` | 插件生命周期管理（安装、启用、禁用、卸载） |
| `PluginLoader`  | 插件资源加载（节点、实体、路由、钩子）     |
| `NodesPool`     | 节点池管理（合并插件节点）                 |
| `DataSource`    | 数据源管理（动态注册实体）                 |

---

## 3. 插件清单规范

### 3.1 Schema 定义

```json
{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "Flowise Plugin Manifest",
    "type": "object",
    "required": ["name"],
    "properties": {
        "name": {
            "type": "string",
            "pattern": "^[a-z0-9-]+$",
            "description": "插件唯一标识符（kebab-case）"
        },
        "version": {
            "type": "string",
            "pattern": "^\\d+\\.\\d+\\.\\d+",
            "description": "语义化版本号"
        },
        "displayName": { "type": "string" },
        "description": { "type": "string" },
        "author": { "type": "string" },
        "nodesDir": { "type": "string", "default": "dist/nodes" },
        "credentialsDir": { "type": "string", "default": "dist/credentials" },
        "entitiesDir": { "type": "string", "default": "dist/entities" },
        "routesDir": { "type": "string", "default": "dist/routes" },
        "i18nDir": { "type": "string" },
        "permissions": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["name", "displayName"],
                "properties": {
                    "name": { "type": "string" },
                    "displayName": { "type": "string" },
                    "description": { "type": "string" },
                    "defaultForRoles": {
                        "type": "array",
                        "items": { "enum": ["admin", "member", "viewer"] }
                    }
                }
            }
        },
        "hooks": {
            "type": "object",
            "properties": {
                "onLoad": { "type": "string" },
                "onUnload": { "type": "string" },
                "onInstall": { "type": "string" },
                "onUninstall": { "type": "string" }
            }
        },
        "menuItems": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "label", "path"],
                "properties": {
                    "id": { "type": "string" },
                    "label": { "type": "string" },
                    "path": { "type": "string" },
                    "icon": { "type": "string" },
                    "order": { "type": "number" },
                    "requiredPermission": { "type": "string" }
                }
            }
        },
        "apiPrefix": { "type": "string" }
    }
}
```

### 3.2 示例配置

```json
{
    "name": "flowise-pet-nodes",
    "version": "1.0.0",
    "displayName": "Pet Nodes",
    "description": "AI Pet system plugin",
    "author": "Flowise",
    "nodesDir": "dist/nodes",
    "entitiesDir": "dist/entities",
    "routesDir": "dist/routes",
    "i18nDir": "src/i18n/locales",
    "permissions": [
        {
            "name": "pet:view",
            "displayName": "View Pet",
            "defaultForRoles": ["admin", "member", "viewer"]
        },
        {
            "name": "pet:teach",
            "displayName": "Teach Pet",
            "defaultForRoles": ["admin", "member"]
        }
    ],
    "hooks": {
        "onLoad": "dist/hooks/onLoad.js",
        "onUnload": "dist/hooks/onUnload.js"
    },
    "menuItems": [
        {
            "id": "pet",
            "label": "Pet",
            "path": "/pet",
            "icon": "Pets",
            "order": 50
        }
    ],
    "apiPrefix": "pet"
}
```

---

## 4. 插件目录结构

```
my-flowise-plugin/
├── flowise-plugin.json      # 插件清单（必需）
├── package.json             # NPM 包配置
├── tsconfig.json            # TypeScript 配置
├── src/
│   ├── nodes/               # AgentFlow 节点
│   │   ├── MyNode.ts
│   │   └── MyNode.svg
│   ├── credentials/         # 凭证类
│   │   └── MyCredential.ts
│   ├── entities/            # TypeORM 实体
│   │   └── MyEntity.ts
│   ├── routes/              # Express 路由
│   │   └── index.ts
│   ├── hooks/               # 生命周期钩子
│   │   ├── onLoad.ts
│   │   └── onUnload.ts
│   └── i18n/
│       └── locales/
│           ├── en.json
│           └── zh.json
└── dist/                    # 编译输出
```

---

## 5. 核心类型定义

### 5.1 插件清单类型

```typescript
interface PluginManifest {
    name: string
    version?: string
    displayName?: string
    description?: string
    author?: string
    nodesDir?: string
    credentialsDir?: string
    entitiesDir?: string
    routesDir?: string
    i18nDir?: string
    permissions?: PluginPermission[]
    hooks?: PluginHooks
    menuItems?: PluginMenuItem[]
    apiPrefix?: string
}
```

### 5.2 权限定义

```typescript
interface PluginPermission {
    name: string
    displayName: string
    description?: string
    defaultForRoles?: ('admin' | 'member' | 'viewer')[]
}
```

### 5.3 钩子上下文

```typescript
interface PluginHookContext {
    pluginId: string
    pluginName: string
    dataSource: DataSource
    router: Router
    logger: {
        info: (message: string, ...args: any[]) => void
        warn: (message: string, ...args: any[]) => void
        error: (message: string, ...args: any[]) => void
        debug: (message: string, ...args: any[]) => void
    }
    config: Record<string, any>
}
```

### 5.4 加载结果

```typescript
interface PluginLoaderResult {
    nodes: IComponentNodes
    credentials: IComponentCredentials
    routes: PluginRoute[]
    entities: any[]
    permissions: PluginPermission[]
    menuItems: PluginMenuItem[]
    hooks?: {
        onLoad?: PluginOnLoadHook
        onUnload?: PluginOnUnloadHook
        onInstall?: PluginOnInstallHook
        onUninstall?: PluginOnUninstallHook
    }
    errors: string[]
}
```

---

## 6. 插件加载流程

### 6.1 安装流程

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   请求安装   │────►│ 解析插件路径 │────►│ 读取清单文件 │
└──────────────┘     └──────────────┘     └──────────────┘
                                                 │
                                                 ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ 返回安装结果 │◄────│ 执行onInstall│◄────│ 保存到数据库 │
└──────────────┘     └──────────────┘     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │  加载插件    │
                     └──────────────┘
```

### 6.2 加载流程

```
┌──────────────┐
│ PluginLoader │
└──────┬───────┘
       │
       ├───────────────────────────────────────┐
       │                                       │
       ▼                                       ▼
┌──────────────┐                       ┌──────────────┐
│  loadNodes   │                       │loadCredentials│
└──────────────┘                       └──────────────┘
       │                                       │
       ├───────────────────────────────────────┤
       │                                       │
       ▼                                       ▼
┌──────────────┐                       ┌──────────────┐
│loadEntities  │                       │ loadRoutes   │
└──────────────┘                       └──────────────┘
       │                                       │
       ├───────────────────────────────────────┤
       │                                       │
       ▼                                       ▼
┌──────────────┐                       ┌──────────────┐
│  loadHooks   │                       │  mergeI18n   │
└──────────────┘                       └──────────────┘
       │                                       │
       └───────────────────┬───────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ 执行 onLoad  │
                    └──────────────┘
```

---

## 7. 生命周期钩子

### 7.1 钩子类型

| 钩子          | 触发时机     | 用途                     |
| ------------- | ------------ | ------------------------ |
| `onInstall`   | 插件首次安装 | 数据库迁移、种子数据     |
| `onLoad`      | 插件启用     | 启动定时任务、初始化资源 |
| `onUnload`    | 插件禁用     | 停止定时任务、释放资源   |
| `onUninstall` | 插件卸载前   | 清理数据、删除表         |

### 7.2 钩子实现示例

```typescript
// src/hooks/onLoad.ts
import { PluginHookContext, PluginHookResult } from 'flowise-server/plugins'

export default async function onLoad(ctx: PluginHookContext): Promise<PluginHookResult> {
    ctx.logger.info('Plugin is loading...')

    // 启动定时任务
    const timer = setInterval(() => {
        ctx.logger.debug('Running scheduled task...')
    }, 60000)

    // 存储到上下文供 onUnload 使用
    ctx.config.timer = timer

    return { success: true }
}
```

```typescript
// src/hooks/onUnload.ts
import { PluginHookContext, PluginHookResult } from 'flowise-server/plugins'

export default async function onUnload(ctx: PluginHookContext): Promise<PluginHookResult> {
    ctx.logger.info('Plugin is unloading...')

    // 清理定时任务
    if (ctx.config.timer) {
        clearInterval(ctx.config.timer)
    }

    return { success: true }
}
```

---

## 8. API 设计

### 8.1 REST API

| 端点                     | 方法   | 说明                  |
| ------------------------ | ------ | --------------------- |
| `/api/v1/plugins`        | GET    | 获取所有插件列表      |
| `/api/v1/plugins`        | POST   | 安装插件              |
| `/api/v1/plugins/:id`    | GET    | 获取插件详情          |
| `/api/v1/plugins/:id`    | PATCH  | 更新插件（启用/禁用） |
| `/api/v1/plugins/:id`    | DELETE | 卸载插件              |
| `/api/v1/plugins/browse` | GET    | 浏览本地目录          |

### 8.2 安装请求

```bash
# 从 NPM 安装
curl -X POST http://localhost:3000/api/v1/plugins \
  -H "Content-Type: application/json" \
  -d '{"source": "npm", "name": "flowise-pet-nodes"}'

# 从本地路径安装
curl -X POST http://localhost:3000/api/v1/plugins \
  -H "Content-Type: application/json" \
  -d '{"source": "local", "name": "./packages/flowise-pet-nodes"}'
```

---

## 9. 权限集成

### 9.1 动态权限加载

插件定义的权限会在加载时自动注册到 RBAC 系统：

```typescript
// PluginManager.ts
getPluginPermissions(): PluginPermission[] {
    const permissions: PluginPermission[] = []
    for (const plugin of this.loadedPlugins.values()) {
        permissions.push(...plugin.permissions)
    }
    return permissions
}
```

### 9.2 权限检查

```typescript
// 在路由中使用
router.get('/items', checkPermission('myplugin:view'), handler)
```

---

## 10. 前端集成

### 10.1 菜单项注入

插件可定义前端菜单项：

```json
{
    "menuItems": [
        {
            "id": "pet",
            "label": "Pet",
            "path": "/pet",
            "icon": "Pets",
            "order": 50,
            "requiredPermission": "pet:view"
        }
    ]
}
```

### 10.2 前端获取菜单

```typescript
// API: GET /api/v1/plugins/menu-items
// 返回所有插件的菜单项
```

---

## 11. 数据库设计

### 11.1 Plugin 实体

```typescript
@Entity('plugin')
export class Plugin {
    @PrimaryGeneratedColumn('uuid')
    id: string

    @Column({ unique: true })
    name: string

    @Column({ nullable: true })
    displayName?: string

    @Column({ nullable: true, type: 'text' })
    description?: string

    @Column({ nullable: true })
    version?: string

    @Column({ default: true })
    enabled: boolean

    @Column({ type: 'text' })
    installPath: string

    @Column({ nullable: true, type: 'text' })
    i18nPath?: string

    @Column({ nullable: true, type: 'text' })
    manifest?: string // JSON 序列化的清单

    @CreateDateColumn()
    createdDate: Date

    @UpdateDateColumn()
    updatedDate: Date
}
```

---

## 12. 错误处理

### 12.1 错误类型

| 错误码                      | 说明         |
| --------------------------- | ------------ |
| `PLUGIN_NOT_FOUND`          | 插件不存在   |
| `PLUGIN_LOAD_FAILED`        | 插件加载失败 |
| `PLUGIN_DEPENDENCY_MISSING` | 依赖插件缺失 |
| `PLUGIN_HOOK_FAILED`        | 钩子执行失败 |

### 12.2 错误处理策略

1. **加载失败**: 记录错误日志，跳过该插件，不影响其他插件
2. **钩子失败**: 记录错误日志，继续执行后续逻辑
3. **依赖缺失**: 阻止插件安装，返回明确错误信息

---

## 13. 安全考虑

### 13.1 插件隔离

-   插件代码运行在主进程中，无沙箱隔离
-   建议只安装可信来源的插件
-   敏感操作需要权限检查

### 13.2 权限最小化

-   插件默认无任何权限
-   需要显式声明所需权限
-   用户可查看插件权限列表

---

## 14. 性能优化

### 14.1 懒加载

-   插件按需加载，不阻塞启动
-   节点、路由等资源延迟注册

### 14.2 缓存

-   插件清单缓存
-   编译产物缓存

---

## 15. 迁移指南

### 15.1 从旧插件系统迁移

旧插件只需添加 `flowise-plugin.json` 即可兼容：

```json
{
    "name": "my-existing-plugin",
    "nodesDir": "dist/nodes"
}
```

### 15.2 Pet 模块迁移

将 Pet 后端逻辑迁移到插件的步骤：

1. 创建 `flowise-plugin.json` 定义权限、钩子等
2. 将 `server/database/entities/` 下的 Pet 实体移至插件
3. 将 `server/routes/pet/` 移至插件
4. 将 `server/utils/pet/cron/` 移至插件的 `onLoad` 钩子
5. 将 `server/services/pet/` 移至插件

---

## 16. 文件清单

| 文件路径                                                         | 说明        |
| ---------------------------------------------------------------- | ----------- |
| `packages/server/src/plugins/schemas/flowise-plugin.schema.json` | JSON Schema |
| `packages/server/src/plugins/types.ts`                           | 类型定义    |
| `packages/server/src/plugins/loader.ts`                          | 插件加载器  |
| `packages/server/src/plugins/manager.ts`                         | 插件管理器  |
| `packages/server/src/plugins/index.ts`                           | 模块入口    |
| `packages/server/src/plugins/README.md`                          | 开发规范    |

---

## 17. 后续工作

1. **集成到 Flowise 主服务**

    - 修改 `src/index.ts` 初始化 PluginManager
    - 修改 `src/NodesPool.ts` 使用 PluginManager
    - 修改 `src/services/plugins/index.ts` 使用新 API

2. **前端支持**

    - 插件管理页面
    - 动态菜单渲染

3. **测试**

    - 单元测试
    - 集成测试
    - E2E 测试

4. **文档**
    - API 文档
    - 开发教程
    - 最佳实践
