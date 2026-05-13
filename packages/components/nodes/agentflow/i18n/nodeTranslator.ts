import { INode, INodeOptionsValue, INodeOutputsValue, INodeParams } from '../../../src/Interface'
import { LocaleCode, parseAcceptLanguage, translate, mergePluginTranslations } from './index'

const NODE_NAME_MAP: Record<string, string> = {
    agentAgentflow: 'agent',
    llmAgentflow: 'llm',
    startAgentflow: 'start',
    conditionAgentflow: 'condition',
    conditionAgentAgentflow: 'conditionAgent',
    toolAgentflow: 'tool',
    httpAgentflow: 'http',
    customFunctionAgentflow: 'customFunction',
    directReplyAgentflow: 'directReply',
    humanInputAgentflow: 'humanInput',
    iterationAgentflow: 'iteration',
    loopAgentflow: 'loop',
    retrieverAgentflow: 'retriever',
    executeFlowAgentflow: 'executeFlow',
    stickyNoteAgentflow: 'stickyNote'
}

function getI18nNodeName(nodeName: string): string | undefined {
    return NODE_NAME_MAP[nodeName]
}

function translateInputParam(param: INodeParams, nodeI18nName: string, locale: LocaleCode): INodeParams {
    const translatedParam = { ...param }

    if (param.label) {
        const translated = translate(`nodes.${nodeI18nName}.inputs.${param.name}`, locale)
        if (translated !== `nodes.${nodeI18nName}.inputs.${param.name}`) {
            translatedParam.label = translated
        }
    }

    if (param.description) {
        const descKey = `${param.name}Desc`
        const translated = translate(`nodes.${nodeI18nName}.descriptions.${descKey}`, locale)
        if (translated !== `nodes.${nodeI18nName}.descriptions.${descKey}`) {
            translatedParam.description = translated
        }
    }

    if (param.placeholder) {
        const placeholderKey = param.name.charAt(0).toUpperCase() + param.name.slice(1)
        const translated = translate(`nodes.${nodeI18nName}.placeholders.${placeholderKey}`, locale)
        if (translated !== `nodes.${nodeI18nName}.placeholders.${placeholderKey}`) {
            translatedParam.placeholder = translated
        }
    }

    if (param.options && Array.isArray(param.options)) {
        translatedParam.options = param.options.map((opt) => {
            const translatedOpt: INodeOptionsValue = { ...opt }
            if (opt.label) {
                const translated = translate(`nodes.${nodeI18nName}.options.${opt.name}`, locale)
                if (translated !== `nodes.${nodeI18nName}.options.${opt.name}`) {
                    translatedOpt.label = translated
                }
            }
            if (opt.description) {
                const translated = translate(`nodes.${nodeI18nName}.descriptions.${opt.name}`, locale)
                if (translated !== `nodes.${nodeI18nName}.descriptions.${opt.name}`) {
                    translatedOpt.description = translated
                }
            }
            return translatedOpt
        })
    }

    if (param.array && Array.isArray(param.array)) {
        translatedParam.array = param.array.map((arrParam) => translateInputParam(arrParam, nodeI18nName, locale))
    }

    if (param.tabs && Array.isArray(param.tabs)) {
        translatedParam.tabs = param.tabs.map((tabParam) => translateInputParam(tabParam, nodeI18nName, locale))
    }

    return translatedParam
}

function translateOutput(output: INodeOutputsValue, nodeI18nName: string, locale: LocaleCode): INodeOutputsValue {
    const translatedOutput = { ...output }

    if (output.description) {
        const translated = translate(`nodes.${nodeI18nName}.outputs.${output.name}`, locale)
        if (translated !== `nodes.${nodeI18nName}.outputs.${output.name}`) {
            translatedOutput.description = translated
        }
    }

    return translatedOutput
}

function translateCredential(credential: INodeParams | undefined, nodeI18nName: string, locale: LocaleCode): INodeParams | undefined {
    if (!credential) return credential

    const translatedCredential = { ...credential }

    if (credential.label) {
        const translated = translate(`nodes.${nodeI18nName}.credentials.${credential.name}`, locale)
        if (translated !== `nodes.${nodeI18nName}.credentials.${credential.name}`) {
            translatedCredential.label = translated
        }
    }

    return translatedCredential
}

export function translateNode(node: INode, locale: LocaleCode): INode {
    const nodeI18nName = getI18nNodeName(node.name)

    if (!nodeI18nName) {
        return node
    }

    const translatedNode = { ...node }

    const translatedLabel = translate(`nodes.${nodeI18nName}.label`, locale)
    if (translatedLabel !== `nodes.${nodeI18nName}.label`) {
        translatedNode.label = translatedLabel
    }

    const translatedDesc = translate(`nodes.${nodeI18nName}.description`, locale)
    if (translatedDesc !== `nodes.${nodeI18nName}.description`) {
        translatedNode.description = translatedDesc
    }

    if (node.inputs && Array.isArray(node.inputs)) {
        translatedNode.inputs = node.inputs.map((param) => translateInputParam(param, nodeI18nName, locale))
    }

    if (node.output && Array.isArray(node.output)) {
        translatedNode.output = node.output.map((output) => translateOutput(output, nodeI18nName, locale))
    }

    if (node.credential) {
        translatedNode.credential = translateCredential(node.credential, nodeI18nName, locale)
    }

    return translatedNode
}

export function getLocaleFromAcceptLanguage(acceptLanguage: string | undefined): LocaleCode {
    return parseAcceptLanguage(acceptLanguage)
}

export { LocaleCode, mergePluginTranslations }
