import { Embeddings, EmbeddingsParams } from '@langchain/core/embeddings'
import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'
import { getBaseClasses } from '../../../src/utils'

export interface CustomHttpEmbeddingsParams extends EmbeddingsParams {
    endpoint: string
    method?: 'GET' | 'POST'
    headers?: Record<string, string>
    requestTemplate?: string
    responseJsonPath?: string
    dimension?: number
    batchSize?: number
    timeout?: number
}

const TEXT_PLACEHOLDER = /\$\{text\}/g
const TEXTS_PLACEHOLDER = /\$\{texts\}/g

function pickByPath(obj: unknown, path: string): unknown {
    if (!path) return obj
    let current: any = obj
    for (const part of path.split('.')) {
        if (current == null) return undefined
        const arrayMatch = part.match(/^(\w+)?\[(\d+)\]$/)
        if (arrayMatch) {
            const key = arrayMatch[1]
            const idx = parseInt(arrayMatch[2], 10)
            if (key) current = current[key]
            current = Array.isArray(current) ? current[idx] : undefined
        } else {
            current = current[part]
        }
    }
    return current
}

export class CustomHttpEmbeddings extends Embeddings implements CustomHttpEmbeddingsParams {
    endpoint: string
    method: 'GET' | 'POST'
    headers?: Record<string, string>
    requestTemplate: string
    responseJsonPath: string
    dimension?: number
    batchSize: number
    timeout: number

    constructor(fields: CustomHttpEmbeddingsParams) {
        super(fields)
        if (!fields.endpoint) throw new Error('CustomHttpEmbeddings: endpoint is required')
        this.endpoint = fields.endpoint
        this.method = fields.method ?? 'POST'
        this.headers = fields.headers
        // Default template assumes a single-text {input} POST body, but supports ${texts} for batch APIs
        this.requestTemplate = fields.requestTemplate ?? '{"input": "${text}"}'
        this.responseJsonPath = fields.responseJsonPath ?? 'data[0].embedding'
        this.dimension = fields.dimension
        this.batchSize = fields.batchSize ?? 16
        this.timeout = fields.timeout ?? 30000
    }

    private renderBody(text: string, texts: string[]): string {
        return this.requestTemplate
            .replace(TEXTS_PLACEHOLDER, JSON.stringify(texts))
            .replace(TEXT_PLACEHOLDER, () => text.replace(/[\\"]/g, (c) => '\\' + c).replace(/\n/g, '\\n'))
    }

    private async _embedOne(text: string): Promise<number[]> {
        const controller = new AbortController()
        const t = setTimeout(() => controller.abort(), this.timeout)
        try {
            const init: RequestInit = {
                method: this.method,
                headers: { 'Content-Type': 'application/json', ...(this.headers || {}) },
                signal: controller.signal
            }
            if (this.method !== 'GET') {
                init.body = this.renderBody(text, [text])
            }
            const res = await fetch(this.endpoint, init)
            if (!res.ok) {
                const body = await res.text().catch(() => '')
                throw new Error(`CustomHttpEmbeddings HTTP ${res.status}: ${body.slice(0, 200)}`)
            }
            const json = await res.json()
            const vec = pickByPath(json, this.responseJsonPath)
            if (!Array.isArray(vec) || typeof vec[0] !== 'number') {
                throw new Error(`CustomHttpEmbeddings: response at "${this.responseJsonPath}" is not number[]`)
            }
            return vec as number[]
        } finally {
            clearTimeout(t)
        }
    }

    async embedDocuments(documents: string[]): Promise<number[][]> {
        const out: number[][] = []
        for (let i = 0; i < documents.length; i += this.batchSize) {
            const batch = documents.slice(i, i + this.batchSize)
            // Sequentially within a batch — simple, predictable, avoids hammering the user's endpoint
            for (const doc of batch) {
                const vec = await this.caller.call(() => this._embedOne(doc))
                out.push(vec)
            }
        }
        return out
    }

    async embedQuery(text: string): Promise<number[]> {
        return this.caller.call(() => this._embedOne(text))
    }
}

class CustomHttpEmbeddings_Embeddings implements INode {
    label: string
    name: string
    version: number
    type: string
    icon: string
    category: string
    description: string
    baseClasses: string[]
    inputs: INodeParams[]

    constructor() {
        this.label = 'Custom HTTP Embeddings'
        this.name = 'customHttpEmbeddings'
        this.version = 1.0
        this.type = 'CustomHttpEmbeddings'
        this.icon = 'CustomHttp.svg'
        this.category = 'Embeddings'
        this.description = 'Generic HTTP embedding endpoint with templated request/response'
        this.baseClasses = [this.type, ...getBaseClasses(CustomHttpEmbeddings)]
        this.inputs = [
            {
                label: 'Endpoint',
                name: 'endpoint',
                type: 'string',
                placeholder: 'https://api.example.com/v1/embeddings'
            },
            {
                label: 'HTTP Method',
                name: 'method',
                type: 'options',
                options: [
                    { label: 'POST', name: 'POST' },
                    { label: 'GET', name: 'GET' }
                ],
                default: 'POST',
                optional: true,
                additionalParams: true
            },
            {
                label: 'Headers',
                name: 'headers',
                type: 'json',
                optional: true,
                additionalParams: true
            },
            {
                label: 'Request Template',
                name: 'requestTemplate',
                type: 'string',
                rows: 4,
                default: '{"input": "${text}"}',
                description: 'JSON body template. Use ${text} for the document. ${texts} expands to a JSON array of all batch items.',
                optional: true,
                additionalParams: true
            },
            {
                label: 'Response JSON Path',
                name: 'responseJsonPath',
                type: 'string',
                default: 'data[0].embedding',
                description: 'Dot/bracket path to the number[] in the response (e.g. data[0].embedding)',
                optional: true,
                additionalParams: true
            },
            {
                label: 'Dimension',
                name: 'dimension',
                type: 'number',
                description: 'Embedding dimension (informational; recorded against Pet for reindex detection)',
                optional: true,
                additionalParams: true
            },
            {
                label: 'Batch Size',
                name: 'batchSize',
                type: 'number',
                default: 16,
                optional: true,
                additionalParams: true
            },
            {
                label: 'Timeout (ms)',
                name: 'timeout',
                type: 'number',
                default: 30000,
                optional: true,
                additionalParams: true
            }
        ]
    }

    async init(nodeData: INodeData, _: string, _options: ICommonObject): Promise<any> {
        const endpoint = (nodeData.inputs?.endpoint as string)?.trim()
        if (!endpoint) throw new Error('CustomHttpEmbeddings: endpoint is required')

        const method = (nodeData.inputs?.method as 'GET' | 'POST') || 'POST'
        const requestTemplate = (nodeData.inputs?.requestTemplate as string) || undefined
        const responseJsonPath = (nodeData.inputs?.responseJsonPath as string) || undefined
        const dimensionRaw = nodeData.inputs?.dimension
        const batchSizeRaw = nodeData.inputs?.batchSize
        const timeoutRaw = nodeData.inputs?.timeout
        const headersRaw = nodeData.inputs?.headers

        let parsedHeaders: Record<string, string> | undefined
        if (headersRaw) {
            try {
                parsedHeaders = typeof headersRaw === 'object' ? (headersRaw as Record<string, string>) : JSON.parse(headersRaw as string)
            } catch (e) {
                throw new Error('CustomHttpEmbeddings: Headers must be valid JSON: ' + (e as Error).message)
            }
        }

        return new CustomHttpEmbeddings({
            endpoint,
            method,
            headers: parsedHeaders,
            requestTemplate,
            responseJsonPath,
            dimension: dimensionRaw ? parseInt(dimensionRaw as string, 10) : undefined,
            batchSize: batchSizeRaw ? parseInt(batchSizeRaw as string, 10) : undefined,
            timeout: timeoutRaw ? parseInt(timeoutRaw as string, 10) : undefined
        })
    }
}

module.exports = { nodeClass: CustomHttpEmbeddings_Embeddings }
