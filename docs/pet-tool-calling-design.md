# Pet 工具调用系统设计文档

## 概述

在 mature 阶段，宠物通过 LLM 理解自然语言命令，按统一格式返回工具调用指令，前端/后端对应执行。用户无需枚举命令，LLM 负责意图理解和工具路由。

---

## 1. AgentFlow 中配置工具

Pet 节点的工具通过 `petServerTools` 输入项从 Flowise Tools 页面选择，无需手填 JSON：

```
Pet 节点 inputs:
  ├── Embedding Model        (asyncOptions)
  ├── Chat Model             (asyncOptions, optional)
  ├── User ID                (string, acceptVariable)
  ├── Pet Input              (string, acceptVariable)
  └── Server Tools           (asyncMultiOptions → listTools, optional)
```

工具定义存储在数据库 `Tool` 表，Pet 节点按所选 ID 加载：

```ts
// tools.ts — schemaToParams：将 Tool.schema JSON 数组转换为 ToolParamDef map
interface ToolDef {
    name: string
    description: string
    executor: 'client' | 'server'
    params: Record<string, ToolParamDef> // 从 Tool.schema 解析
}
```

### executor 说明

| 值       | 含义                           | 示例                   |
| -------- | ------------------------------ | ---------------------- |
| `client` | 前端浏览器执行（JS）           | TTS、UI 动作、导航     |
| `server` | PetCore 服务端 NodeVM 沙箱执行 | 查天气、搜索、调度 API |

规则：

-   只有 **mature 阶段**才将工具 schema 注入 system prompt
-   早期阶段（egg / babble / echo / talk）不注入，避免小模型乱输 JSON
-   流式输出路径（streaming）仅在**无工具**时启用；有工具时强制走非流式，保证 JSON 完整性

---

## 2. 内置工具种子化

`seedBuiltinPetTools(appDataSource)` 在服务启动时将三个内置工具写入每个 Workspace，幂等执行（同名存在则更新 func / description / schema）：

| 工具名           | executor | 说明                                         |
| ---------------- | -------- | -------------------------------------------- |
| `tts`            | client   | 客户端桥接，朗读文字列表，支持循环和语速控制 |
| `schedule`       | server   | 创建定时任务（cron / interval / delay）      |
| `cancelSchedule` | server   | 按名称取消已创建的定时任务                   |

TTS 是"client-bridge"模式：服务端 `func` 执行后返回 `__client_tool__` 标记，PetCore 检测到该标记后将工具调用透传给前端执行（而非在服务端真正调用 TTS）：

```js
// seedBuiltinTools.ts — tts func（在 NodeVM 中执行）
return JSON.stringify({
    __client_tool__: 'tts',
    texts: list,
    times: params.times || 1,
    rate: params.rate || 1.0,
    interval: params.interval ?? 300
})
```

---

## 3. 固定返回格式

### System Prompt 末尾追加（mature 阶段）

由 `buildToolSchemaSection(tools)` 生成，追加在 personality 描述之后：

```
你可以调用以下工具：

[tts] 朗读文字。支持单条或多条循环朗读 — texts:string[](要朗读的文字列表), times:number(循环次数,默认1), rate:number(语速,默认1.0), interval:number(间隔ms,默认300)
[schedule] 创建定时任务 — name:string(任务名), scheduleType:string(cron/interval/delay), ...

需要调用工具时，必须严格返回以下 JSON，不能包含任何其他文字：
{"speech":"<对用户说的话>","tool":{"name":"<工具名>","params":{...}}}

不需要工具时，直接回复普通文字，不要输出 JSON。
```

### LLM 输出约定

| 场景     | 输出示例                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------ |
| 普通聊天 | `你好呀，今天怎么样？`                                                                                       |
| 工具调用 | `{"speech":"好的，我来读10遍","tool":{"name":"tts","params":{"texts":["cat","map"],"times":10,"rate":0.8}}}` |

### PetCore 解析链（三层兜底）

```
1. JSON.parse(rawText)
     → 成功且有 speech 字段 → 提取 speech + tool
2. regex 提取第一个包含 "speech" 的 {...} 块
     → 再尝试 JSON.parse
3. 兜底
     → 整条 rawText 作为 speech，toolCall = undefined
```

实现在 `tools.ts` 的 `parseToolResponse(raw, tools)`，返回：

```ts
interface ParsedToolResponse {
    speech: string
    toolCall?: {
        name: string
        params: Record<string, any>
        executor: 'client' | 'server' // 从 ToolDef 中反查
    }
}
```

---

## 4. 响应返回与工具执行

### PetCore 执行路径

```
handleChat
  └── mature && hasTools
        → chatModel.invoke (非流式)
        → parseToolResponse(responseText, petTools)
        → handleToolResponse:
              toolCall.executor === 'client'
                → respond(speech, ..., toolCall)  // 透传给前端
              toolCall.executor === 'server'
                → executeServerTool({ toolEntity, speech, toolParams, ctx })
                    → NodeVM 执行 toolEntity.func
                    → parseClientBridge(result)   // 检测 __client_tool__ 标记
                    → 返回 { speech, toolCall? }
              无 toolCall
                → respond(speech)
```

### buildReturn 输出结构

```ts
output: {
    content: string     // 展示给用户的文字（气泡内容）
    toolCall?: {
        name: string
        params: Record<string, any>
        executor: 'client' | 'server'
    }
}
```

### Action 卡片统一格式

action 类型的卡片命中时，直接以 client toolCall 返回，不经过 LLM：

```ts
// 命中 action 卡片（cosine ≥ ACTION_MATCH_THRESHOLD）
return this.respond('好的！', nodeData, userText, chatId, sseStreamer, isLastNode, {
    name: actionMatches[0].output, // 卡片 output 即 intent 名
    params: {},
    executor: 'client'
})
```

---

## 5. 前端工具执行器

### toolExecutors.js

```
// TTS executor：支持文字列表、循环次数、语速、间隔
// times=0 → 持续循环直到下一条消息（cancelActiveTts 自动中止）
tts: async ({ text, texts, times = 1, rate = 1.0, interval = 300 }, { ttsHook }) => {
    // speakOnce + sleepInterruptible 循环，见 toolExecutors.js
}
```

关键设计：

-   `cancelActiveTts()` — 被 `index.jsx` 在用户发送下一条消息时调用，中止当前 TTS 循环
-   `sleepInterruptible(ms, abortRef)` — 每 50ms 检查 `abortRef.cancelled`，支持提前退出
-   `_abortRef` 模块级变量，保存当前活跃的 abort 句柄

### index.jsx handleChat 调用链

```
用户发送消息
  → cancelActiveTts()        // 中止上一条消息的 TTS 循环
  → stop()                   // 停止自动朗读（usePetTts）
  → API 请求
  → resp.data.output.content → setChatHistory（气泡显示）
  → resp.data.output.toolCall?
        executor === 'client' → executeTool(toolCall, { ttsHook })
  → autoPlay && name !== 'tts'
        → speak(speech)      // 避免与 tts 工具重复朗读
```

---

## 6. 调度触发检测

Schedule 节点触发 agentflow 时，会将 `contextParams` 以 JSON 字符串形式作为 `question` 传入。Pet 节点通过 `triggerDetector.ts` 识别该格式：

```ts
// triggerDetector.ts
export function detectScheduleTrigger(userText: string): TriggerContext | null {
    // 依赖 agentCreated 字段区分触发器与用户手动输入的 JSON
    if (!ctx?.agentCreated) return null
    return { prompt: ctx.prompt, userId: ctx.userId }
}
```

`PetCore.resolveInputs` 检测到触发器后，将 `prompt` 替换为用户文本，并从 `trigger.userId` 补全 userId。

---

## 7. 模块结构

重构后 Pet 节点代码拆分为以下模块，消除了 PetCore.ts 中的内联常量和工具函数：

| 文件                    | 职责                                                                     |
| ----------------------- | ------------------------------------------------------------------------ |
| `constants.ts`          | 所有可调参数（阈值、alpha、topK、字符上限）                              |
| `personality.ts`        | 特征向量表 + 向量运算（`zeroVec` / `parseVec` / `clampVec` 等）          |
| `localizedResponses.ts` | 多语言原始音效和教学确认文本                                             |
| `tools.ts`              | `ToolDef` 类型、`parseToolResponse`、`executeServerTool`、`buildToolCtx` |
| `triggerDetector.ts`    | 调度触发器 JSON 检测                                                     |
| `teachingParser.ts`     | 教学指令正则解析（`parseTeachingCommand`）                               |
| `matcher.ts`            | 余弦相似度匹配（`findTopMatches`）                                       |
| `responder.ts`          | 各阶段 system prompt 构建 + few-shot 消息构建                            |
| `personalityDrift.ts`   | 回合级 / 会话级 / 每日人格漂移（`applyTurnDrift` 等）                    |
| `traitProbe.ts`         | LLM 探测对话人格特征增量                                                 |
| `stage.ts`              | 阶段推导（`deriveStage` / `deriveLevel`）                                |
| `PetCore.ts`            | 节点入口，协调所有模块                                                   |

---

## 8. 整体数据流

```
用户输入 / 调度触发
  → resolveInputs
      → detectScheduleTrigger（触发器格式？→ 提取 prompt + userId）
  → handleSessionChange（新 chatId → 触发上一会话人格合并）
  → parseTeachingCommand
      → 教学指令？→ handleTeach → 存卡片 + 更新人格向量
  → handleChat
      → deriveStage(cardCount, chatTurns)
      → egg     → buildEggResponse（原始音效）
      → babble  → findTopMatches → buildBabbleResponse
      → echo/talk/mature（需要 chatModel）
          → findTopMatches（few-shot recall）
          → selectStagePrompt（注入工具 schema，仅 mature）
          → chatModel.stream / invoke
          → applyTurnDrift（异步，不阻塞响应）
          → mature && hasTools → handleToolResponse
              → parseToolResponse → { speech, toolCall? }
              → executor=server → executeServerTool（NodeVM）
              → executor=client → 透传
  → buildReturn
      → output: { content, toolCall? }
  → 前端
      → 显示 speech 气泡
      → executeTool（client toolCall）
      → autoPlay（非 tts 工具时）→ speak(speech)
```

---

## 9. 改动文件清单

| 文件                                   | 改动内容                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `Pet/PetCore.ts`                       | 完全重构：按职责拆分私有方法，导入所有新模块，移除内联常量                  |
| `Pet/constants.ts` _(新增)_            | 全部魔法数字集中管理                                                        |
| `Pet/personality.ts` _(新增)_          | 特征向量 + 向量运算，从 teachingParser / personalityDrift 提取              |
| `Pet/localizedResponses.ts` _(新增)_   | 多语言响应文本，从 responder / PetCore 提取                                 |
| `Pet/tools.ts` _(新增)_                | ToolDef 类型、解析、执行、buildToolCtx，从 responder / PetCore 提取         |
| `Pet/triggerDetector.ts` _(新增)_      | 调度触发器检测，从 PetCore 提取                                             |
| `Pet/responder.ts`                     | 移除 ToolDef / buildToolSchemaSection（已迁至 tools.ts），使用常量          |
| `Pet/teachingParser.ts`                | 移除 TRAIT_VECTORS / computePersonalityDelta（已迁至 personality.ts）       |
| `Pet/traitProbe.ts`                    | DIM 常量改为 import PERSONALITY_DIM                                         |
| `Pet/personalityDrift.ts`              | 移除本地向量函数和 alpha 常量，全部 import 自 personality.ts / constants.ts |
| `server/utils/pet/seedBuiltinTools.ts` | 新增 `schedule` / `cancelSchedule` 内置工具，tts 改为 client-bridge 模式    |
| `ui/views/pet/toolExecutors.js`        | 重写 TTS executor：支持 texts[]、times=0 无限循环、sleepInterruptible       |
| `ui/views/pet/index.jsx`               | handleChat 头部调用 `cancelActiveTts()` + `stop()`                          |

---

## 10. 后续扩展路径

1. **Edge TTS / OpenAI TTS**：tts executor 改为调后端 `/api/v1/pet/tts`，返回音频 URL，前端 `<audio>` 播放
2. **工具调用结果回传 LLM**：server tool 执行结果追加为 `tool` role 消息，让 LLM 生成最终回复（完整 agent loop）
3. **新增 client 工具**：在 `toolExecutors.js` 的 `TOOL_EXECUTORS` 中注册，无需改后端
4. **新增 server 工具**：在 Flowise Tools 页面创建，Pet 节点勾选即可，无需改代码
