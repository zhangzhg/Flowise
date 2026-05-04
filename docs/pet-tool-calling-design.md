# Pet 工具调用系统设计文档

## 概述

在 mature 阶段，宠物通过 LLM 理解自然语言命令，按统一格式返回工具调用指令，前端/后端对应执行。用户无需枚举命令，LLM 负责意图理解和工具路由。

---

## 1. AgentFlow 中配置工具

Pet 节点新增一个 `petTools` 输入项，类型为 JSON，用户在 AgentFlow 画布里直接填写工具定义数组：

```
Pet 节点 inputs:
  ├── Embedding Model   (已有)
  ├── Chat Model        (已有)
  ├── User ID           (已有)
  ├── Pet Input         (已有)
  └── Available Tools   (新增, type: json, optional: true)
```

### 工具定义格式

```json
[
    {
        "name": "tts",
        "description": "朗读指定文字，支持语速和重复次数",
        "executor": "client",
        "params": {
            "text": { "type": "string", "description": "要朗读的内容" },
            "times": { "type": "number", "description": "重复次数", "default": 1 },
            "rate": { "type": "number", "description": "语速 0.5慢~2.0快", "default": 1.0 }
        }
    },
    {
        "name": "weather",
        "description": "查询天气",
        "executor": "server",
        "params": {
            "city": { "type": "string", "description": "城市名" }
        }
    }
]
```

### executor 说明

| 值       | 含义               | 示例                 |
| -------- | ------------------ | -------------------- |
| `client` | 前端浏览器执行     | TTS、UI 动作、导航   |
| `server` | PetCore 服务端执行 | 查天气、搜索、调 API |

-   只有 **mature 阶段**才将工具 schema 注入 system prompt
-   早期阶段（egg/babble/echo/talk）不注入，避免小模型乱输 JSON

---

## 2. 固定返回格式

### System Prompt 末尾追加（mature 阶段）

```
你可以调用以下工具：

[tts] 朗读文字 — text:string, times:number, rate:number
[weather] 查询天气 — city:string

需要调用工具时，必须严格返回以下 JSON，不能包含任何其他文字：
{"speech":"<对用户说的话>","tool":{"name":"<工具名>","params":{...}}}

不需要工具时，直接回复普通文字，不要输出 JSON。
```

### LLM 输出约定

| 场景     | 输出示例                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------- |
| 普通聊天 | `你好呀，今天怎么样？`                                                                              |
| 工具调用 | `{"speech":"好的，我来读10遍","tool":{"name":"tts","params":{"text":"pet","times":10,"rate":0.5}}}` |

### PetCore 解析链（三层兜底）

```
1. JSON.parse(response)
     → 成功且有 speech 字段 → 提取 speech + tool
2. regex 提取 /\{[\s\S]*"speech"[\s\S]*\}/
     → 再尝试 JSON.parse
3. 兜底
     → 整条 response 作为 speech，tool = null
```

解析结果统一结构：

```ts
interface ParsedResponse {
    speech: string
    toolCall?: {
        name: string
        params: Record<string, any>
    }
}
```

### 现有 action 卡片统一进来

原来的 `[play]` 标记统一改为相同格式：

```ts
// 原来
output: { content: '[play]', usedTool: 'play' }

// 统一后
output: { content: '好的！', toolCall: { name: 'play', params: {} } }
```

---

## 3. 响应返回动作

### PetCore `buildReturn` 扩展

```ts
output: {
  content: speech,           // 展示给用户的文字（气泡内容）
  toolCall?: {               // 可选，有则执行
    name: string,
    params: Record<string, any>,
    executor: 'client' | 'server'
  }
}
```

-   `executor: 'server'` 的工具在 PetCore 内执行，结果追加到 speech 再返回
-   `executor: 'client'` 的工具透传给前端，由浏览器执行

### 前端工具执行器注册表

新建 `packages/ui/src/views/pet/toolExecutors.js`：

```js
const TOOL_EXECUTORS = {
    tts: async ({ text, times = 1, rate = 1.0 }, { ttsHook }) => {
        for (let i = 0; i < times; i++) {
            await ttsHook.speakOnce(text, rate)
        }
    }
    // 预留扩展口：
    // weather: async ({ city }, ctx) => { ... },
    // navigate: async ({ url }, ctx) => { ... },
    // search:   async ({ query }, ctx) => { ... },
}

export async function executeTool(toolCall, context) {
    const executor = TOOL_EXECUTORS[toolCall?.name]
    if (!executor) return
    await executor(toolCall.params, context)
}
```

### 前端 handleChat 调用链

```
收到 resp
  ├── speech → setChatHistory（展示气泡）
  ├── toolCall.executor === 'client'
  │     → executeTool(toolCall, { ttsHook })
  └── autoPlay && toolCall?.name !== 'tts'
        → speak(speech)   // 避免与 tts 工具重复朗读
```

---

## 整体数据流

```
用户输入
  → PetCore.handleChat
      → mature 阶段？→ 读取 petTools 节点输入，构造工具 schema
      → 注入 system prompt（工具列表 + 输出格式约定）
      → chatModel.invoke(messages)
      → parseToolResponse(rawText)
          → { speech, toolCall? }
      → toolCall.executor === 'server'？
          → 执行服务端工具，结果追加到 speech
      → buildReturn({ content: speech, toolCall })
  → 前端 handleChat
      → 展示 speech 气泡
      → toolCall.executor === 'client'？
          → executeTool → TTS 循环 / UI 动作 / ...
```

---

## 改动文件清单

| 文件                                                   | 改动内容                                                                                                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/components/nodes/agentflow/Pet/PetCore.ts`   | 新增 `petTools` 输入项；mature 阶段注入工具 schema；`parseToolResponse` 解析函数；`buildReturn` 扩展 `toolCall` 字段；action 卡片统一格式 |
| `packages/components/nodes/agentflow/Pet/responder.ts` | `selectStagePrompt` mature 阶段接收 `toolSchema` 参数，拼入 prompt 末尾                                                                   |
| `packages/ui/src/views/pet/toolExecutors.js`           | 新建，前端工具注册表，预留扩展口                                                                                                          |
| `packages/ui/src/views/pet/index.jsx`                  | `handleChat` 读取 `resp.data.output.toolCall`，调 `executeTool`                                                                           |

---

## 后续扩展路径

1. **接入 Edge TTS / OpenAI TTS**：tts executor 改为调后端 `/api/v1/pet/tts` 接口，返回音频 URL，前端 `<audio>` 播放
2. **server tool 接入 Flowise 自定义工具**：`executor: 'server'` 时，按 `name` 查找已注册的 Flowise CustomTool 并调用
3. **工具调用结果回传给 LLM**：server tool 执行结果追加为 `tool` role 消息，让 LLM 生成最终回复（完整 agent loop）
