// Frontend tool executor registry.
// Each key matches a tool `name` defined in the Pet node's "Available Tools" config.
// executor: 'client' tools are routed here; executor: 'server' tools are handled in PetCore.ts.
//
// To add a new tool:
//   1. Add its definition to the petTools JSON in AgentFlow
//   2. Add its executor function here under the same name

function speakOnce(text, rate, ttsHook) {
    return new Promise((resolve) => {
        const synth = window.speechSynthesis
        if (!synth) return resolve()
        synth.cancel()
        const utt = new SpeechSynthesisUtterance(text)
        utt.rate = rate
        if (ttsHook?.settings?.voiceName) {
            const voices = synth.getVoices()
            const v = voices.find((v) => v.name === ttsHook.settings.voiceName)
            if (v) utt.voice = v
        }
        utt.onend = resolve
        utt.onerror = resolve
        synth.speak(utt)
    })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const TOOL_EXECUTORS = {
    // TTS: read a list of texts aloud N times at given rate, with optional inter-item pause
    tts: async ({ text, texts, times = 1, rate = 1.0, interval = 300 }, { ttsHook } = {}) => {
        const list = Array.isArray(texts) && texts.length ? texts : text ? [text] : []
        if (!list.length) return
        const n = Math.min(Math.max(1, Math.round(Number(times) || 1)), 50)
        const r = Math.min(Math.max(0.5, Number(rate) || 1.0), 2.0)
        const gap = Math.max(0, Math.min(5000, Number(interval) || 0))
        for (let i = 0; i < n; i++) {
            for (const t of list) {
                await speakOnce(String(t), r, ttsHook)
                if (gap > 0) await sleep(gap)
            }
        }
    }

    // Reserved — add other client-side tools here:
    // navigate: async ({ url }, ctx) => { window.open(url, '_blank') },
}

/**
 * Execute a tool call returned from the pet node.
 * @param {object} toolCall  - { name, params, executor }
 * @param {object} context   - { ttsHook }  (context passed to executor)
 */
export async function executeTool(toolCall, context = {}) {
    if (!toolCall?.name) return
    const executor = TOOL_EXECUTORS[toolCall.name]
    if (!executor) {
        console.warn(`[PetTools] No client executor for tool: ${toolCall.name}`)
        return
    }
    try {
        await executor(toolCall.params ?? {}, context)
    } catch (e) {
        console.error(`[PetTools] Error executing tool "${toolCall.name}":`, e)
    }
}
