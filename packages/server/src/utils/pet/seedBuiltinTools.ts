import { DataSource } from 'typeorm'
import { Tool } from '../../database/entities/Tool'
import { Workspace } from '../../enterprise/database/entities/workspace.entity'

/**
 * Built-in pet tools that should always exist in the DB.
 * `tts` is a client-bridge tool: its `func` returns a `__client_tool__` marker
 * that PetCore detects and routes to the browser for Web Speech API execution.
 */
const BUILTIN_TOOLS: Array<Partial<Tool>> = [
    {
        name: 'tts',
        description:
            '【朗读工具】用户要求读出/朗读/背诵任何文字时必须调用。texts 为单词/句子列表，times 为重复次数（0=持续循环直到下一条消息），rate 为语速。',
        color: '#FFD700',
        iconSrc: '',
        schema: JSON.stringify([
            {
                property: 'texts',
                type: 'string[]',
                description: '要朗读的文字列表，例如 ["cat","map","cap"]',
                required: true
            },
            { property: 'times', type: 'number', description: '整组循环次数，默认1；0=持续循环直到用户发下一条消息', required: false },
            { property: 'rate', type: 'number', description: '语速 0.5慢~2.0快，默认1.0', required: false },
            { property: 'interval', type: 'number', description: '相邻条目之间的间隔毫秒，默认300', required: false }
        ]),
        func: `// TTS 由浏览器执行，此函数返回客户端桥接信号
const params = (() => { try { return JSON.parse(input) } catch { return { text: input } } })()
const list = Array.isArray(params.texts) ? params.texts : (params.text ? [params.text] : [input])
return JSON.stringify({
  __client_tool__: 'tts',
  texts: list,
  times: params.times || 1,
  rate: params.rate || 1.0,
  interval: params.interval ?? 300
})`
    },
    {
        name: 'schedule',
        description: '创建定时任务，让宠物在指定时间自动执行（如每天朗读单词、定时提醒）。',
        color: '#4DA3FF',
        iconSrc: '',
        schema: JSON.stringify([
            { property: 'name', type: 'string', description: '任务名称（同名会覆盖）', required: true },
            {
                property: 'scheduleType',
                type: 'string',
                description: 'cron / interval / delay',
                required: true
            },
            {
                property: 'cronExpression',
                type: 'string',
                description: 'cron 表达式，如 "0 8 * * *"（仅 cron 类型必填）',
                required: false
            },
            {
                property: 'interval',
                type: 'number',
                description: '间隔秒数，>=60（仅 interval 类型必填）',
                required: false
            },
            {
                property: 'delay',
                type: 'number',
                description: '一次性延迟秒数（仅 delay 类型必填）',
                required: false
            },
            {
                property: 'prompt',
                type: 'string',
                description: '触发时给宠物的指令，例如 "请朗读 cat map cap 5 次"',
                required: true
            }
        ]),
        func: `const params = (() => { try { return JSON.parse(input) } catch { return {} } })()
if (!$ctx || !$ctx.baseURL || !$ctx.userId || !$ctx.workspaceId) return '调度创建失败: 缺少上下文'
const url = $ctx.baseURL + '/api/v1/pet/me/schedules'
const headers = {
  'Content-Type': 'application/json',
  'X-Internal-Source': 'pet-sandbox',
  'X-Pet-UserId': $ctx.userId,
  'X-Pet-WorkspaceId': $ctx.workspaceId
}
const res = await fetch(url, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    name: params.name,
    scheduleType: params.scheduleType,
    cronExpression: params.cronExpression,
    interval: params.interval,
    delay: params.delay,
    prompt: params.prompt
  })
})
if (!res.ok) {
  const err = await res.text().catch(() => '')
  return '调度创建失败: ' + res.status + ' ' + err
}
const data = await res.json()
return '已创建定时任务「' + data.name + '」'`
    },
    {
        name: 'cancelSchedule',
        description: '取消已创建的定时任务（按名称）。',
        color: '#FF6B6B',
        iconSrc: '',
        schema: JSON.stringify([{ property: 'name', type: 'string', description: '要取消的任务名称', required: true }]),
        func: `const params = (() => { try { return JSON.parse(input) } catch { return {} } })()
if (!$ctx || !$ctx.baseURL || !$ctx.userId || !$ctx.workspaceId || !params.name) return '取消失败: 缺少参数'
const url = $ctx.baseURL + '/api/v1/pet/me/schedules/' + encodeURIComponent(params.name)
const headers = {
  'X-Internal-Source': 'pet-sandbox',
  'X-Pet-UserId': $ctx.userId,
  'X-Pet-WorkspaceId': $ctx.workspaceId
}
const res = await fetch(url, { method: 'DELETE', headers })
if (!res.ok) return '取消失败: ' + res.status
const data = await res.json()
return data.removed ? '已取消「' + params.name + '」' : '未找到名为「' + params.name + '」的任务'`
    }
]

/**
 * Seed built-in tools into every workspace. Tools page filters by workspaceId,
 * so each workspace needs its own copy. Idempotent — looks up by (name, workspaceId).
 */
export async function seedBuiltinPetTools(appDataSource: DataSource): Promise<void> {
    const toolRepo = appDataSource.getRepository(Tool)
    const workspaceRepo = appDataSource.getRepository(Workspace)
    const workspaces = await workspaceRepo.find()
    if (!workspaces.length) return

    for (const ws of workspaces) {
        for (const def of BUILTIN_TOOLS) {
            const existing = await toolRepo.findOneBy({ name: def.name as string, workspaceId: ws.id })
            if (existing) {
                // Upsert: refresh func/description/schema so seed updates roll out without manual DB edits
                if (existing.func !== def.func || existing.description !== def.description || existing.schema !== def.schema) {
                    await toolRepo.update(existing.id, {
                        description: def.description,
                        schema: def.schema,
                        func: def.func,
                        color: def.color
                    })
                }
                continue
            }
            await toolRepo.save(toolRepo.create({ ...def, workspaceId: ws.id }))
        }
    }
}
