import { Embeddings, EmbeddingsParams } from '@langchain/core/embeddings'
import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'
import { getBaseClasses, getEnvironmentVariable } from '../../../src/utils'

export interface BgeHttpEmbeddingsParams extends EmbeddingsParams {
    endpoint: string
    batchSize?: number
    timeout?: number
    headers?: Record<string, string>
}

/**
 * Talks to a self-hosted bge-small-zh service exposing the HuggingFace
 * Text Embeddings Inference (TEI) protocol:
 *   POST {endpoint}/embed   { "inputs": ["text1", "text2"] } => number[][]
 */
export class BgeHttpEmbeddings extends Embeddings implements BgeHttpEmbeddingsParams {
    endpoint: string
    batchSize: number
    timeout: number
    headers?: Record<string, string>

    constructor(fields: BgeHttpEmbeddingsParams) {
        super(fields)
        const trimmed = (fields.endpoint || '').replace(/\/+$/, '')
        if (!trimmed) throw new Error('BgeSmallZhEmbeddings: endpoint is required')
        this.endpoint = trimmed
        this.batchSize = fields.batchSize ?? 32
        this.timeout = fields.timeout ?? 30000
        this.headers = fields.headers
    }

    private async _embedBatch(texts: string[]): Promise<number[][]> {
        const controller = new AbortController()
        const t = setTimeout(() => controller.abort(), this.timeout)
        try {
            const res = await fetch(`${this.endpoint}/embed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(this.headers || {}) },
                body: JSON.stringify({ inputs: texts }),
                signal: controller.signal
            })
            if (!res.ok) {
                const body = await res.text().catch(() => '')
                throw new Error(`BGE embedding HTTP ${res.status}: ${body.slice(0, 200)}`)
            }
            const data = (await res.json()) as number[][]
            if (!Array.isArray(data) || !Array.isArray(data[0])) {
                throw new Error('BGE embedding response is not number[][]')
            }
            return data
        } finally {
            clearTimeout(t)
        }
    }

    async embedDocuments(documents: string[]): Promise<number[][]> {
        const out: number[][] = []
        for (let i = 0; i < documents.length; i += this.batchSize) {
            const batch = documents.slice(i, i + this.batchSize)
            const vecs = await this.caller.call(() => this._embedBatch(batch))
            out.push(...vecs)
        }
        return out
    }

    async embedQuery(text: string): Promise<number[]> {
        const [vec] = await this._embedBatch([text])
        return vec
    }
}

class BgeSmallZhEmbeddings_Embeddings implements INode {
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
        this.label = 'BGE-small-zh Embeddings'
        this.name = 'bgeSmallZhEmbeddings'
        this.version = 1.0
        this.type = 'BgeSmallZhEmbeddings'
        this.icon = 'BgeSmallZh.svg'
        this.category = 'Embeddings'
        this.description = 'Self-hosted bge-small-zh HTTP service (HuggingFace TEI compatible)'
        this.baseClasses = [this.type, ...getBaseClasses(BgeHttpEmbeddings)]
        this.inputs = [
            {
                label: 'Endpoint',
                name: 'endpoint',
                type: 'string',
                placeholder: 'http://localhost:8080',
                description: 'TEI endpoint root. Falls back to env BGE_EMBEDDING_URL.',
                optional: true
            },
            {
                label: 'Batch Size',
                name: 'batchSize',
                type: 'number',
                default: 32,
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
            },
            {
                label: 'Headers',
                name: 'headers',
                type: 'json',
                optional: true,
                additionalParams: true,
                description: 'Extra HTTP headers (e.g., for an auth proxy)'
            }
        ]
    }

    async init(nodeData: INodeData, _: string, _options: ICommonObject): Promise<any> {
        const userEndpoint = (nodeData.inputs?.endpoint as string)?.trim()
        const envEndpoint = getEnvironmentVariable('BGE_EMBEDDING_URL')
        const endpoint = userEndpoint || envEndpoint
        if (!endpoint) {
            throw new Error('BgeSmallZhEmbeddings requires an endpoint: set the node Endpoint field or env BGE_EMBEDDING_URL')
        }

        const batchSizeRaw = nodeData.inputs?.batchSize
        const timeoutRaw = nodeData.inputs?.timeout
        const headersRaw = nodeData.inputs?.headers

        let parsedHeaders: Record<string, string> | undefined
        if (headersRaw) {
            try {
                parsedHeaders = typeof headersRaw === 'object' ? (headersRaw as Record<string, string>) : JSON.parse(headersRaw as string)
            } catch (e) {
                throw new Error('BgeSmallZhEmbeddings: Headers must be valid JSON: ' + (e as Error).message)
            }
        }

        return new BgeHttpEmbeddings({
            endpoint,
            batchSize: batchSizeRaw ? parseInt(batchSizeRaw as string, 10) : undefined,
            timeout: timeoutRaw ? parseInt(timeoutRaw as string, 10) : undefined,
            headers: parsedHeaders
        })
    }
}

module.exports = { nodeClass: BgeSmallZhEmbeddings_Embeddings }
