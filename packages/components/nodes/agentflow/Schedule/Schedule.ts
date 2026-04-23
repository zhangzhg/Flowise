import { ICommonObject, INode, INodeData, INodeParams } from '../../../src/Interface'

class Schedule_Agentflow implements INode {
    label: string
    name: string
    version: number
    description: string
    type: string
    icon: string
    category: string
    color: string
    hideInput: boolean
    baseClasses: string[]
    inputs: INodeParams[]

    constructor() {
        this.label = 'Schedule'
        this.name = 'scheduleAgentflow'
        this.version = 1.0
        this.type = 'Schedule'
        this.category = 'Agent Flows'
        this.icon = 'Schedule.svg'
        this.description = 'Trigger agentflow on a schedule (delay, interval, or cron expression)'
        this.color = '#9C27B0'
        this.hideInput = true
        this.baseClasses = [this.type]
        this.inputs = [
            {
                label: 'Schedule Type',
                name: 'scheduleType',
                type: 'options',
                options: [
                    {
                        label: 'Delay',
                        name: 'delay',
                        description: 'Execute once after a delay'
                    },
                    {
                        label: 'Interval',
                        name: 'interval',
                        description: 'Execute repeatedly at fixed intervals'
                    },
                    {
                        label: 'Cron',
                        name: 'cron',
                        description: 'Execute based on cron expression'
                    }
                ],
                default: 'cron'
            },
            {
                label: 'Delay (seconds)',
                name: 'delay',
                type: 'number',
                description: 'Delay in seconds before execution',
                placeholder: '10',
                show: {
                    scheduleType: 'delay'
                }
            },
            {
                label: 'Initial Delay (seconds)',
                name: 'initialDelay',
                type: 'number',
                description: 'Delay in seconds before the first execution',
                placeholder: '0',
                default: 0,
                optional: true,
                show: {
                    scheduleType: 'interval'
                }
            },
            {
                label: 'Interval (seconds)',
                name: 'interval',
                type: 'number',
                description: 'Interval in seconds between executions',
                placeholder: '60',
                show: {
                    scheduleType: 'interval'
                }
            },
            {
                label: 'Cron Expression',
                name: 'cronExpression',
                type: 'string',
                description: 'Cron expression (e.g., "0 9 * * 1-5" for weekdays at 9am)',
                placeholder: '0 9 * * 1-5',
                show: {
                    scheduleType: 'cron'
                }
            },
            {
                label: 'Max Executions',
                name: 'maxExecutions',
                type: 'number',
                description: 'Maximum number of times to execute (0 = unlimited)',
                placeholder: '0',
                default: 0,
                optional: true,
                show: {
                    scheduleType: ['interval', 'cron']
                }
            },
            {
                label: 'Timezone',
                name: 'timezone',
                type: 'string',
                description: 'Timezone for cron execution (e.g., "Asia/Shanghai", "UTC")',
                placeholder: 'UTC',
                default: 'UTC',
                optional: true,
                show: {
                    scheduleType: 'cron'
                }
            },
            {
                label: 'Context Parameters',
                name: 'contextParams',
                description: 'Static key-value pairs injected into the trigger context on each execution',
                type: 'array',
                optional: true,
                array: [
                    {
                        label: 'Key',
                        name: 'key',
                        type: 'string',
                        placeholder: 'paramName'
                    },
                    {
                        label: 'Value',
                        name: 'value',
                        type: 'string',
                        placeholder: 'paramValue'
                    }
                ]
            }
        ]
    }

    async run(nodeData: INodeData, input: string, _options: ICommonObject): Promise<any> {
        // input is the JSON-serialized trigger context injected by SchedulerService
        let triggerContext: ICommonObject = {}
        try {
            const parsed = typeof input === 'string' ? JSON.parse(input) : input
            if (parsed && typeof parsed === 'object') {
                triggerContext = parsed
            }
        } catch {
            // input is not JSON — treat as plain question (e.g. manual test run)
            triggerContext = { note: input }
        }

        // Merge user-defined static context params from node config
        const rawParams = nodeData.inputs?.contextParams
        const contextParams: Array<{ key: string; value: string }> = typeof rawParams === 'string' ? JSON.parse(rawParams) : rawParams ?? []

        const userContext: ICommonObject = {}
        for (const param of contextParams) {
            if (param.key) userContext[param.key] = param.value
        }

        const scheduleContext: ICommonObject = {
            scheduledAt: triggerContext.scheduledAt ?? new Date().toISOString(),
            executionCount: triggerContext.executionCount ?? 1,
            scheduleId: triggerContext.scheduleId ?? '',
            scheduleType: nodeData.inputs?.scheduleType ?? 'cron',
            cronExpression: nodeData.inputs?.cronExpression ?? '',
            ...userContext,
            // allow runtime values to override static params
            ...triggerContext.runtimeParams
        }

        return {
            id: nodeData.id,
            name: this.name,
            input: { trigger: input },
            output: {
                content: JSON.stringify(scheduleContext),
                scheduleContext
            }
        }
    }
}

module.exports = { nodeClass: Schedule_Agentflow }
