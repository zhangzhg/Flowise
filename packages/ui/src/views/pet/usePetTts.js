import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'pet_tts_settings'

const DEFAULT_SETTINGS = {
    enabled: false,
    autoPlay: false,
    engine: 'webSpeech', // 'webSpeech' | 'edge' | 'openai'
    rate: 1,
    pitch: 1,
    voiceName: '' // empty = browser default
}

function loadSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS }
    } catch {
        return { ...DEFAULT_SETTINGS }
    }
}

function saveSettings(s) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    } catch {
        console.error('Error saving settings:', s)
        return
    }
}

export function usePetTts() {
    const [settings, setSettings] = useState(loadSettings)
    const [speaking, setSpeaking] = useState(false)
    const [voices, setVoices] = useState([])
    const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null)

    const supported = !!synthRef.current

    // Load available voices (async in some browsers)
    useEffect(() => {
        if (!supported) return
        const synth = synthRef.current
        const load = () => setVoices(synth.getVoices())
        load()
        synth.addEventListener('voiceschanged', load)
        return () => synth.removeEventListener('voiceschanged', load)
    }, [supported])

    const updateSettings = useCallback((patch) => {
        setSettings((prev) => {
            const next = { ...prev, ...patch }
            saveSettings(next)
            return next
        })
    }, [])

    const stop = useCallback(() => {
        if (!supported) return
        synthRef.current.cancel()
        setSpeaking(false)
    }, [supported])

    const speak = useCallback(
        (text) => {
            if (!supported || !settings.enabled || !text) return
            synthRef.current.cancel()
            const utterance = new SpeechSynthesisUtterance(text)
            utterance.rate = settings.rate
            utterance.pitch = settings.pitch
            if (settings.voiceName) {
                const v = voices.find((voice) => voice.name === settings.voiceName)
                if (v) utterance.voice = v
            }
            utterance.onstart = () => setSpeaking(true)
            utterance.onend = () => setSpeaking(false)
            utterance.onerror = () => setSpeaking(false)
            synthRef.current.speak(utterance)
        },
        [supported, settings, voices]
    )

    return { speak, stop, speaking, supported, settings, updateSettings, voices }
}
