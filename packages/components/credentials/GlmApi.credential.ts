import { INodeCredential, INodeParams } from '../src/Interface'

class GlmApi implements INodeCredential {
    label: string
    name: string
    version: number
    description: string
    inputs: INodeParams[]

    constructor() {
        this.label = 'GLM API'
        this.name = 'glmApi'
        this.version = 1.0
        this.description = 'ZhipuAI GLM-compatible endpoint. Defaults to https://open.bigmodel.cn/api/paas/v4 if Base URL is left blank.'
        this.inputs = [
            {
                label: 'GLM API Key',
                name: 'glmApiKey',
                type: 'password'
            },
            {
                label: 'Base URL',
                name: 'glmBaseUrl',
                type: 'string',
                default: 'https://open.bigmodel.cn/api/paas/v4',
                optional: true,
                description: 'Override only when using a self-hosted or proxied GLM-compatible endpoint'
            }
        ]
    }
}

module.exports = { credClass: GlmApi }
