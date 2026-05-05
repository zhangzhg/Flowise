import { executeJavaScriptCode } from '../../../src/utils'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ToolParamDef {
    type: string
    description: string
    default?: any
}

export interface ToolDef {
    name: string
    description: string
    executor: 'client' | 'server'
    params: Record<string, ToolParamDef>
}

export interface ToolCall {
    name: string
    params: Record<string, any>
    executor: string
}

export interface ParsedToolResponse {
    speech: string
    toolCall?: ToolCall
}

export interface ToolCtx {
    chatflowId: string
    userId: string
    workspaceId: string
    baseURL: string
    [key: string]: any
}

export interface ServerToolResult {
    speech: string
    toolCall?: ToolCall
}

const SERVER_TOOL_TIMEOUT_MS = 15000
const TOOL_FAIL_SUFFIX = '（工具执行失败）'

// ── Schema → ToolDef ─────────────────────────────────────────────────────────

/** Convert a DB tool's `schema` JSON array into a ToolParamDef map. */
export function schemaToParams(schemaJson: string | null | undefined): Record<string, ToolParamDef> {
    if (!schemaJson) return {}
    try {
        const arr = JSON.parse(schemaJson)
        if (!Array.isArray(arr)) return {}
        const result: Record<string, ToolParamDef> = {}
        for (const item of arr) {
            if (item?.property) {
                result[item.property] = {
                    type: item.type ?? 'string',
                    description: item.description ?? '',
                    ...(item.default !== undefined ? { default: item.default } : {})
                }
            }
        }
        return result
    } catch {
        return {}
    }
}

/**
 * Build ToolDef list and a name→entity Map from selected DB Tool entities.
 * The Map enables O(1) lookup at execution time.
 */
export function buildToolDefs(entities: any[]): { defs: ToolDef[]; map: Map<string, any> } {
    const map = new Map<string, any>()
    const defs: ToolDef[] = entities.map((t: any) => {
        map.set(t.name, t)
        return {
            name: t.name,
            description: t.description ?? t.name,
            executor: 'server' as const,
            params: schemaToParams(t.schema)
        }
    })
    return { defs, map }
}

// ── System-prompt formatting ─────────────────────────────────────────────────

/** Build the prompt section that documents available tools to the LLM. */
export function buildToolSchemaSection(tools: ToolDef[]): string {
    if (!tools.length) return ''
    const lines: string[] = ['', '你可以调用以下工具：', '']
    for (const tool of tools) {
        const paramDesc = Object.entries(tool.params)
            .map(([k, v]) => `${k}:${v.type}(${v.description}${v.default !== undefined ? `,默认${v.default}` : ''})`)
            .join(', ')
        lines.push(`[${tool.name}] ${tool.description} — ${paramDesc}`)
    }
    lines.push(
        '',
        '工具调用规则：',
        '• 用户要求"读/朗读/背/念"任何文字时，必须调用 tts 工具。',
        '• speech 只写给用户的简短回应，禁止在 speech 中重复待朗读的内容。',
        '• texts 填单词列表（每个单词只写一次），times 填重复次数，由工具自动循环。',
        '• 示例：用户说"读3遍：cat、cap、net"，则输出：',
        '  {"speech":"好的，我来读3遍","tool":{"name":"tts","params":{"texts":["cat","cap","net"],"times":3}}}',
        '• 需要调用工具时，只输出上面格式的 JSON，不加任何前缀或多余文字。',
        '• 不需要工具时，直接回复普通文字，不要输出 JSON。'
    )
    return lines.join('\n')
}

// ── LLM response parsing ─────────────────────────────────────────────────────

/**
 * Extract the first brace-balanced JSON object from text.
 * Handles nested objects/arrays and quoted strings correctly —
 * unlike a lazy regex which stops at the first `}` inside a nested object.
 */
function extractFirstJsonObject(text: string): string | null {
    const start = text.indexOf('{')
    if (start === -1) return null
    let depth = 0
    let inString = false
    let escape = false
    for (let i = start; i < text.length; i++) {
        const c = text[i]
        if (escape) {
            escape = false
            continue
        }
        if (inString) {
            if (c === '\\') escape = true
            else if (c === '"') inString = false
            continue
        }
        if (c === '"') {
            inString = true
            continue
        }
        if (c === '{') depth++
        else if (c === '}') {
            if (--depth === 0) return text.slice(start, i + 1)
        }
    }
    return null
}

/**
 * Parse an LLM response into speech + optional toolCall. Three-layer fallback:
 *   1. direct JSON.parse
 *   2. extract first brace-balanced {...} block and JSON.parse
 *   3. plain text fallback (whole text becomes speech)
 */
export function parseToolResponse(raw: string, tools: ToolDef[]): ParsedToolResponse {
    const trimmed = (raw || '').trim()
    const lookupExecutor = (name: string) => tools.find((t) => t.name === name)?.executor ?? 'server'

    const tryParse = (s: string): ParsedToolResponse | null => {
        try {
            const obj = JSON.parse(s)
            if (typeof obj.speech !== 'string') return null
            const toolCall = obj.tool?.name
                ? { name: obj.tool.name, params: obj.tool.params ?? {}, executor: lookupExecutor(obj.tool.name) }
                : undefined
            return { speech: obj.speech, toolCall }
        } catch {
            return null
        }
    }

    const direct = tryParse(trimmed)
    if (direct) return direct

    const extracted = extractFirstJsonObject(trimmed)
    if (extracted) {
        const result = tryParse(extracted)
        if (result) return result
        // LLM split speech (plain text before JSON) and tool-only JSON on separate lines
        try {
            const obj = JSON.parse(extracted)
            if (obj.tool?.name) {
                const jsonStart = trimmed.indexOf(extracted)
                const speechBefore = jsonStart > 0 ? trimmed.slice(0, jsonStart).trim() : ''
                const toolCall = { name: obj.tool.name, params: obj.tool.params ?? {}, executor: lookupExecutor(obj.tool.name) }
                return { speech: speechBefore, toolCall }
            }
        } catch {
            /* not valid JSON or no tool field */
        }
    }

    return { speech: trimmed }
}

// ── Sandbox execution ────────────────────────────────────────────────────────

/**
 * Build the $ctx object injected into NodeVM sandbox for server tools.
 * `extra` allows callers to attach extra fields without modifying this module.
 */
export function buildToolCtx(options: any, userId: string, extra?: Record<string, any>): ToolCtx {
    return {
        chatflowId: (options?.chatflowid as string) || '',
        userId,
        workspaceId: (options?.workspaceId as string) || '',
        baseURL: (options?.baseURL as string) || process.env.FLOWISE_URL || '',
        ...(extra ?? {})
    }
}

/** Detect __client_tool__ bridge marker in a tool execution result string. */
function parseClientBridge(resultStr: string): ToolCall | null {
    try {
        const data = JSON.parse(resultStr)
        if (data && typeof data.__client_tool__ === 'string') {
            return { name: data.__client_tool__, params: data, executor: 'client' }
        }
    } catch {
        // not JSON or not a bridge marker — fall through
    }
    return null
}

/**
 * Execute a server-side tool inside NodeVM.
 * - If the func returns a __client_tool__ bridge marker → result.toolCall is set
 * - Otherwise the func's text result is appended to speech
 * - Errors are caught and returned as a friendly speech suffix
 */
export async function executeServerTool(params: {
    toolEntity: any
    speech: string
    toolParams: Record<string, any>
    ctx: ToolCtx
    timeoutMs?: number
    failureSuffix?: string
}): Promise<ServerToolResult> {
    const { toolEntity, speech, toolParams, ctx, timeoutMs = SERVER_TOOL_TIMEOUT_MS, failureSuffix = TOOL_FAIL_SUFFIX } = params

    if (!toolEntity?.func) return { speech }

    try {
        const inputStr = JSON.stringify(toolParams)
        const result = await executeJavaScriptCode(toolEntity.func, { input: inputStr, $ctx: ctx }, { timeout: timeoutMs })
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result)

        const bridgeCall = parseClientBridge(resultStr)
        if (bridgeCall) return { speech, toolCall: bridgeCall }

        return { speech: resultStr ? `${speech}\n${resultStr}` : speech }
    } catch {
        return { speech: `${speech}${failureSuffix}` }
    }
}
