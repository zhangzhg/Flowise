// Frontend tool executor registry.
// Each key matches a tool `name` defined in the Pet node's "Available Tools" config.
// executor: 'client' tools are routed here; executor: 'server' tools are handled in PetCore.ts.
//
// To add a new tool:
//   1. Add its definition to the petTools JSON in AgentFlow
//   2. Add its executor function here under the same name

// Active TTS abort handle — replaced each time tts executor starts.
// cancelActiveTts() sets cancelled=true and cancels the current utterance,
// causing speakOnce to resolve immediately and the loop to exit.
let _abortRef = null

export function cancelActiveTts() {
    if (_abortRef) _abortRef.cancelled = true
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel()
}

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

// Sleep that wakes early if abortRef.cancelled becomes true (checks every 50 ms).
function sleepInterruptible(ms, abortRef) {
    return new Promise((resolve) => {
        if (ms <= 0 || abortRef.cancelled) return resolve()
        const deadline = Date.now() + ms
        const tick = () => {
            if (abortRef.cancelled || Date.now() >= deadline) resolve()
            else setTimeout(tick, Math.min(50, deadline - Date.now()))
        }
        setTimeout(tick, Math.min(50, ms))
    })
}

const TOOL_EXECUTORS = {
    // TTS: read a list of texts aloud N times at given rate, with optional inter-item pause.
    // times=0  → loop indefinitely until the user sends the next message (cancelActiveTts is
    //            called automatically at the start of handleChat).
    // times>0  → repeat that many times (max 999).
    tts: async ({ text, texts, times = 1, rate = 1.0, interval = 300 }, { ttsHook } = {}) => {
        const list = Array.isArray(texts) && texts.length ? texts : text ? [text] : []
        if (!list.length) return

        const abortRef = { cancelled: false }
        _abortRef = abortRef

        const infinite = Number(times) === 0
        const n = infinite ? Infinity : Math.min(Math.max(1, Math.round(Number(times) || 1)), 999)
        const r = Math.min(Math.max(0.5, Number(rate) || 1.0), 2.0)
        const gap = Math.max(0, Math.min(5000, Number(interval) || 0))

        for (let i = 0; (infinite || i < n) && !abortRef.cancelled; i++) {
            for (const t of list) {
                if (abortRef.cancelled) break
                await speakOnce(String(t), r, ttsHook)
                if (gap > 0) await sleepInterruptible(gap, abortRef)
            }
        }

        if (_abortRef === abortRef) _abortRef = null
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
