import { INodeCredential, INodeParams } from '../src/Interface'

class ZhipuAIApi implements INodeCredential {
    label: string
    name: string
    version: number
    inputs: INodeParams[]

    constructor() {
        this.label = 'ZhipuAI API'
        this.name = 'zhipuAIApi'
        this.version = 1.0
        this.inputs = [
            {
                label: 'ZhipuAI API Key',
                name: 'zhipuAIApiKey',
                type: 'password'
            }
        ]
    }
}

module.exports = { credClass: ZhipuAIApi }
