export type OpenClawSkillType = 'api' | 'code' | 'llm'

export interface OpenClawSkillInput {
    property: string
    type: 'string' | 'number' | 'boolean' | 'date'
    description?: string
    required?: boolean
}

export interface OpenClawApiConfig {
    url: string
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
    headers?: Record<string, string>
    body?: unknown
}

export interface OpenClawLlmConfig {
    endpoint: string
    model?: string
    apiKeyVar?: string
    promptTemplate?: string
}

export interface OpenClawManifest {
    name: string
    version?: string
    description: string
    iconUrl?: string
    type: OpenClawSkillType
    inputs: OpenClawSkillInput[]
    entry?: string
    entryContent?: string
    config?: OpenClawApiConfig | OpenClawLlmConfig | Record<string, unknown>
}

export interface ParsedSkill {
    manifest: OpenClawManifest
    entryContent?: string
}
