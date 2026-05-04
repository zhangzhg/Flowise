import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSelector } from 'react-redux'
import {
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    IconButton,
    InputLabel,
    MenuItem,
    Select,
    Slider,
    Stack,
    Switch,
    TextField,
    Tooltip,
    Typography,
    List,
    ListItem,
    ListItemText,
    Paper
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import {
    IconGripVertical,
    IconLink,
    IconLinkOff,
    IconCards,
    IconPlus,
    IconSend,
    IconSettings,
    IconTrash,
    IconVolume,
    IconVolumeOff
} from '@tabler/icons-react'
import { useDispatch } from 'react-redux'
import { enqueueSnackbar as enqueueSnackbarAction } from '@/store/actions'
import useNotifier from '@/utils/useNotifier'
import MainCard from '@/ui-component/cards/MainCard'
import ViewHeader from '@/layout/MainLayout/ViewHeader'
import petApi from '@/api/pet'
import chatflowsApi from '@/api/chatflows'
import predictionApi from '@/api/prediction'
import { v4 as uuidv4 } from 'uuid'
import { PRESET_PACKS, getCardEmoji } from './presetCards'
import { usePetTts } from './usePetTts'
import { executeTool } from './toolExecutors'

const DRAG_MIME = 'application/x-pet-card'

const STAGE_LABELS = { egg: 'stageEgg', babble: 'stageBabble', echo: 'stageEcho', talk: 'stageTalk', mature: 'stageMature' }

function deriveProgress(cardCount, chatTurns) {
    return Math.floor((cardCount || 0) * 2 + (chatTurns || 0))
}

function deriveStage(cardCount, chatTurns = 0) {
    const p = deriveProgress(cardCount, chatTurns)
    if (p >= 500) return 'mature'
    if (p >= 200) return 'talk'
    if (p >= 40) return 'echo'
    if (p >= 2) return 'babble'
    return 'egg'
}

const STAGE_NEXT_PROGRESS = { egg: 2, babble: 40, echo: 200, talk: 500, mature: null }

const PetPage = () => {
    const theme = useTheme()
    const { t } = useTranslation()
    const dispatch = useDispatch()
    useNotifier()

    const currentUser = useSelector((state) => state.auth.user)

    const enqueueSnackbar = (...args) => dispatch(enqueueSnackbarAction(...args))

    const [pet, setPet] = useState(null)
    const [loading, setLoading] = useState(true)
    const [agentflows, setAgentflows] = useState([])

    const [createOpen, setCreateOpen] = useState(false)
    const [feedOpen, setFeedOpen] = useState(false)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [linkOpen, setLinkOpen] = useState(false)
    const [ttsSettingsOpen, setTtsSettingsOpen] = useState(false)

    const { speak, stop, speaking, supported: ttsSupported, settings: ttsSettings, updateSettings: updateTtsSettings, voices } = usePetTts()

    const [createName, setCreateName] = useState('')
    const [createLang, setCreateLang] = useState('zh')

    const [feedType, setFeedType] = useState('vocab')
    const [feedInput, setFeedInput] = useState('')
    const [feedOutput, setFeedOutput] = useState('')

    const [selectedFlowId, setSelectedFlowId] = useState('')

    const [chatInput, setChatInput] = useState('')
    const [chatHistory, setChatHistory] = useState([])
    const [chatting, setChatting] = useState(false)
    const chatSessionId = useRef(uuidv4())
    const chatEndRef = useRef(null)

    const [dragOverPet, setDragOverPet] = useState(false)
    const [feedingCard, setFeedingCard] = useState(null) // { input, output } currently being fed
    const [fedCardKeys, setFedCardKeys] = useState(() => new Set())

    const fetchPet = async () => {
        try {
            const resp = await petApi.getMyPet()
            setPet(resp.data)
        } catch (e) {
            if (e?.response?.status === 404) setPet(null)
        } finally {
            setLoading(false)
        }
    }

    const fetchAgentflows = async () => {
        try {
            const resp = await chatflowsApi.getAllAgentflows('AGENTFLOW')
            setAgentflows(resp.data || [])
        } catch {
            setAgentflows([])
        }
    }

    useEffect(() => {
        fetchPet()
        fetchAgentflows()
    }, [])

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [chatHistory])

    const handleCreate = async () => {
        try {
            const resp = await petApi.createPet({ name: createName, language: createLang })
            setPet(resp.data)
            setCreateOpen(false)
            setCreateName('')
            enqueueSnackbar({ message: t('pet.created'), options: { variant: 'success', key: Date.now() } })
        } catch (e) {
            enqueueSnackbar({ message: e?.response?.data?.message || e.message, options: { variant: 'error', key: Date.now() } })
        }
    }

    const handleFeed = async () => {
        try {
            const resp = await petApi.feedCard({ cardType: feedType, input: feedInput, output: feedOutput })
            setPet((prev) => ({ ...prev, ...resp.data.pet }))
            setFeedOpen(false)
            setFeedInput('')
            setFeedOutput('')
            enqueueSnackbar({ message: t('pet.cardFed'), options: { variant: 'success', key: Date.now() } })
        } catch (e) {
            enqueueSnackbar({ message: e?.response?.data?.message || e.message, options: { variant: 'error', key: Date.now() } })
        }
    }

    const cardKey = (card) => `${card.cardType}::${card.input}::${card.output}`

    const handleDropCard = async (card) => {
        setDragOverPet(false)
        if (!card || !card.input || !card.output || feedingCard) return
        const key = cardKey(card)
        if (fedCardKeys.has(key)) {
            enqueueSnackbar({ message: t('pet.cardAlreadyFed'), options: { variant: 'info', key: Date.now() } })
            return
        }
        setFeedingCard(card)
        try {
            const resp = await petApi.feedCard({
                cardType: card.cardType,
                input: card.input,
                output: card.output,
                traitTags: card.traitTags,
                source: 'library'
            })
            setPet((prev) => ({ ...prev, ...resp.data.pet }))
            setFedCardKeys((prev) => {
                const next = new Set(prev)
                next.add(key)
                return next
            })
            enqueueSnackbar({ message: t('pet.cardFed'), options: { variant: 'success', key: Date.now() } })
        } catch (e) {
            enqueueSnackbar({ message: e?.response?.data?.message || e.message, options: { variant: 'error', key: Date.now() } })
        } finally {
            setFeedingCard(null)
        }
    }

    const handlePetDragOver = (e) => {
        if (e.dataTransfer.types.includes(DRAG_MIME)) {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
            if (!dragOverPet) setDragOverPet(true)
        }
    }

    const handlePetDragLeave = (e) => {
        // only clear when leaving the drop zone itself, not children
        if (e.currentTarget.contains(e.relatedTarget)) return
        setDragOverPet(false)
    }

    const handlePetDrop = (e) => {
        e.preventDefault()
        const raw = e.dataTransfer.getData(DRAG_MIME)
        if (!raw) {
            setDragOverPet(false)
            return
        }
        try {
            const card = JSON.parse(raw)
            handleDropCard(card)
        } catch {
            setDragOverPet(false)
        }
    }

    const handleDelete = async () => {
        try {
            await petApi.deletePet()
            setPet(null)
            setDeleteOpen(false)
            setChatHistory([])
            enqueueSnackbar({ message: t('pet.deleted'), options: { variant: 'success', key: Date.now() } })
        } catch (e) {
            enqueueSnackbar({ message: e?.response?.data?.message || e.message, options: { variant: 'error', key: Date.now() } })
        }
    }

    const handleLinkFlow = async () => {
        try {
            const resp = await petApi.updatePet({ petFlowId: selectedFlowId || null })
            setPet(resp.data)
            setLinkOpen(false)
            enqueueSnackbar({ message: t('pet.flowLinked'), options: { variant: 'success', key: Date.now() } })
        } catch (e) {
            enqueueSnackbar({ message: e?.response?.data?.message || e.message, options: { variant: 'error', key: Date.now() } })
        }
    }

    const handleChat = async () => {
        const text = chatInput.trim()
        if (!text || chatting) return

        if (!pet?.petFlowId) {
            enqueueSnackbar({ message: t('pet.noFlowLinked'), options: { variant: 'warning', key: Date.now() } })
            return
        }

        setChatInput('')
        setChatHistory((h) => [...h, { role: 'user', content: text }])
        setChatting(true)

        try {
            const resp = await predictionApi.sendMessageAndGetPrediction(pet.petFlowId, {
                question: text,
                chatId: chatSessionId.current,
                overrideConfig: {
                    petUserId: currentUser?.id || ''
                }
            })
            const answer = resp.data?.text || resp.data?.output?.content || resp.data?.answer || '...'
            const toolCall = resp.data?.output?.toolCall
            setChatHistory((h) => [...h, { role: 'assistant', content: answer }])
            if (toolCall?.executor === 'client' || (!toolCall?.executor && toolCall?.name)) {
                executeTool(toolCall, { ttsHook: { settings: ttsSettings, speak } })
            } else if (ttsSettings.autoPlay) {
                speak(answer)
            }
        } catch (e) {
            const msg = e?.response?.data?.message || e.message
            setChatHistory((h) => [...h, { role: 'assistant', content: `Error: ${msg}` }])
        } finally {
            setChatting(false)
        }
    }

    const linkedFlow = agentflows.find((f) => f.id === pet?.petFlowId)
    const attrs = pet?.attributes || {}
    const cardCount = attrs.cardCount ?? 0
    const chatTurns = attrs.chatTurns ?? 0
    const progress = deriveProgress(cardCount, chatTurns)
    const stage = deriveStage(cardCount, chatTurns)
    const nextProgress = STAGE_NEXT_PROGRESS[stage]

    if (loading) {
        return (
            <MainCard>
                <Box display='flex' justifyContent='center' mt={4}>
                    <CircularProgress />
                </Box>
            </MainCard>
        )
    }

    return (
        <MainCard>
            <ViewHeader title={t('pet.title')} />
            <Box sx={{ mt: 2 }}>
                {!pet ? (
                    <Box display='flex' flexDirection='column' alignItems='center' mt={6} gap={2}>
                        <Typography color='textSecondary'>{t('pet.noPet')}</Typography>
                        <Button variant='contained' startIcon={<IconPlus />} onClick={() => setCreateOpen(true)}>
                            {t('pet.createPet')}
                        </Button>
                    </Box>
                ) : (
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems='flex-start'>
                        <Stack spacing={2} sx={{ flex: 1, minWidth: 0 }}>
                            {/* Pet Info — drop target for preset cards */}
                            <Card
                                variant='outlined'
                                onDragOver={handlePetDragOver}
                                onDragLeave={handlePetDragLeave}
                                onDrop={handlePetDrop}
                                sx={{
                                    position: 'relative',
                                    transition: 'all 0.15s',
                                    borderColor: dragOverPet ? theme.palette.primary.main : undefined,
                                    borderWidth: dragOverPet ? 2 : 1,
                                    borderStyle: dragOverPet ? 'dashed' : 'solid',
                                    bgcolor: dragOverPet ? theme.palette.action.hover : undefined,
                                    transform: feedingCard ? 'scale(1.01)' : 'none'
                                }}
                            >
                                <CardContent>
                                    <Stack direction='row' alignItems='center' justifyContent='space-between' flexWrap='wrap' gap={1}>
                                        <Stack spacing={1}>
                                            <Typography variant='h4'>{pet.name}</Typography>
                                            <Stack direction='row' spacing={1} flexWrap='wrap'>
                                                <Chip label={t(`pet.${STAGE_LABELS[stage]}`)} color='primary' size='small' />
                                                <Chip label={`Lv.${attrs.level ?? 1}`} size='small' />
                                                <Chip label={`${t('pet.cardCount')}: ${cardCount}`} size='small' variant='outlined' />
                                                <Tooltip
                                                    title={`${t('pet.chatTurns')}: ${chatTurns}  |  ${t('pet.progress')}: ${progress}${
                                                        nextProgress ? ` / ${nextProgress}` : ''
                                                    }`}
                                                >
                                                    <Chip
                                                        label={nextProgress ? `${progress} / ${nextProgress}` : t('pet.stageMature')}
                                                        size='small'
                                                        variant='outlined'
                                                        color={nextProgress ? 'default' : 'success'}
                                                    />
                                                </Tooltip>
                                            </Stack>
                                        </Stack>
                                        <Stack direction='row' spacing={1} flexWrap='wrap'>
                                            <Button variant='outlined' startIcon={<IconCards />} onClick={() => setFeedOpen(true)}>
                                                {t('pet.feedCard')}
                                            </Button>
                                            <Tooltip title={linkedFlow ? linkedFlow.name : t('pet.linkFlow')}>
                                                <Button
                                                    variant='outlined'
                                                    color={linkedFlow ? 'success' : 'warning'}
                                                    startIcon={linkedFlow ? <IconLink /> : <IconLinkOff />}
                                                    onClick={() => {
                                                        setSelectedFlowId(pet.petFlowId || '')
                                                        setLinkOpen(true)
                                                    }}
                                                >
                                                    {linkedFlow ? linkedFlow.name : t('pet.linkFlow')}
                                                </Button>
                                            </Tooltip>
                                            <Button
                                                variant='outlined'
                                                color='error'
                                                startIcon={<IconTrash />}
                                                onClick={() => setDeleteOpen(true)}
                                            >
                                                {t('pet.deletePet')}
                                            </Button>
                                        </Stack>
                                    </Stack>
                                    {(dragOverPet || feedingCard) && (
                                        <Box
                                            sx={{
                                                position: 'absolute',
                                                inset: 0,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                bgcolor: 'rgba(0,0,0,0.04)',
                                                pointerEvents: 'none',
                                                borderRadius: 1
                                            }}
                                        >
                                            <Typography variant='subtitle1' color='primary'>
                                                {feedingCard ? `${t('pet.feeding')} ${feedingCard.input}…` : t('pet.dropToFeed')}
                                            </Typography>
                                        </Box>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Chat Area */}
                            <Card variant='outlined'>
                                <CardContent>
                                    <Stack direction='row' alignItems='center' justifyContent='space-between' sx={{ mb: 1 }}>
                                        <Typography variant='subtitle1'>{t('pet.chat')}</Typography>
                                        <Stack direction='row' spacing={0.5} alignItems='center'>
                                            {ttsSupported && (
                                                <Tooltip title={ttsSettings.enabled ? t('tts.disableVoice') : t('tts.enableVoice')}>
                                                    <IconButton
                                                        size='small'
                                                        color={ttsSettings.enabled ? 'primary' : 'default'}
                                                        onClick={() => {
                                                            if (ttsSettings.enabled) stop()
                                                            updateTtsSettings({ enabled: !ttsSettings.enabled })
                                                        }}
                                                    >
                                                        {ttsSettings.enabled ? <IconVolume size={18} /> : <IconVolumeOff size={18} />}
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                            <Tooltip title={t('tts.settings')}>
                                                <IconButton size='small' onClick={() => setTtsSettingsOpen(true)}>
                                                    <IconSettings size={18} />
                                                </IconButton>
                                            </Tooltip>
                                        </Stack>
                                    </Stack>
                                    {!pet.petFlowId && (
                                        <Typography variant='body2' color='warning.main' sx={{ mb: 1 }}>
                                            {t('pet.noFlowLinked')}
                                        </Typography>
                                    )}
                                    <Paper
                                        variant='outlined'
                                        sx={{ height: 320, overflowY: 'auto', p: 1, mb: 1, bgcolor: theme.palette.background.default }}
                                    >
                                        <List dense>
                                            {chatHistory.map((msg, i) => (
                                                <ListItem
                                                    key={i}
                                                    sx={{
                                                        justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                                        alignItems: 'flex-end',
                                                        gap: 0.5
                                                    }}
                                                >
                                                    <Paper
                                                        sx={{
                                                            p: 1,
                                                            maxWidth: '70%',
                                                            bgcolor:
                                                                msg.role === 'user'
                                                                    ? theme.palette.primary.main
                                                                    : theme.palette.background.paper,
                                                            color: msg.role === 'user' ? '#fff' : 'inherit'
                                                        }}
                                                    >
                                                        <ListItemText primary={msg.content} />
                                                    </Paper>
                                                    {msg.role === 'assistant' && ttsSupported && ttsSettings.enabled && (
                                                        <Tooltip title={t('tts.speak')}>
                                                            <IconButton
                                                                size='small'
                                                                onClick={() => speak(msg.content)}
                                                                sx={{ mb: 0.5, flexShrink: 0 }}
                                                            >
                                                                {speaking ? <CircularProgress size={14} /> : <IconVolume size={14} />}
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                </ListItem>
                                            ))}
                                            {chatting && (
                                                <ListItem sx={{ justifyContent: 'flex-start' }}>
                                                    <CircularProgress size={16} />
                                                </ListItem>
                                            )}
                                            <div ref={chatEndRef} />
                                        </List>
                                    </Paper>
                                    <Stack direction='row' spacing={1}>
                                        <TextField
                                            size='small'
                                            value={chatInput}
                                            onChange={(e) => setChatInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleChat()}
                                            placeholder={pet.petFlowId ? t('pet.chat') : t('pet.linkFlowFirst')}
                                            disabled={!pet.petFlowId || chatting}
                                            sx={{ flex: 1 }}
                                        />
                                        <Button
                                            variant='contained'
                                            onClick={handleChat}
                                            disabled={!pet.petFlowId || chatting || !chatInput.trim()}
                                            endIcon={<IconSend />}
                                            sx={{ flexShrink: 0, minWidth: 80 }}
                                        >
                                            {t('pet.send')}
                                        </Button>
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Stack>

                        {/* Preset Packs panel — drag cards onto pet to feed */}
                        <Box sx={{ width: { xs: '100%', md: 320 }, flexShrink: 0 }}>
                            <Card variant='outlined'>
                                <CardContent>
                                    <Typography variant='subtitle1' gutterBottom>
                                        {t('pet.presetPacks')}
                                    </Typography>
                                    <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mb: 1.5 }}>
                                        {t('pet.dragToFeedHint')}
                                    </Typography>
                                    <Stack spacing={2}>
                                        {PRESET_PACKS.map((pack) => (
                                            <Box key={pack.id}>
                                                <Typography variant='body2' sx={{ fontWeight: 600, mb: 0.75 }}>
                                                    {pack.emoji} {t(pack.labelKey)}
                                                </Typography>
                                                <Stack direction='row' flexWrap='wrap' gap={0.75}>
                                                    {pack.cards.map((card) => {
                                                        const key = cardKey(card)
                                                        const fed = fedCardKeys.has(key)
                                                        return (
                                                            <Tooltip
                                                                key={key}
                                                                title={`${card.input} → ${card.output}`}
                                                                placement='top'
                                                                arrow
                                                            >
                                                                <Chip
                                                                    size='small'
                                                                    icon={<IconGripVertical size={12} />}
                                                                    label={`${getCardEmoji(card.cardType)} ${card.input}`}
                                                                    draggable={!fed && !feedingCard}
                                                                    onDragStart={(e) => {
                                                                        e.dataTransfer.setData(DRAG_MIME, JSON.stringify(card))
                                                                        e.dataTransfer.effectAllowed = 'copy'
                                                                    }}
                                                                    sx={{
                                                                        cursor: fed ? 'default' : 'grab',
                                                                        opacity: fed ? 0.4 : 1,
                                                                        '&:active': { cursor: 'grabbing' }
                                                                    }}
                                                                    color={fed ? 'default' : 'primary'}
                                                                    variant={fed ? 'filled' : 'outlined'}
                                                                />
                                                            </Tooltip>
                                                        )
                                                    })}
                                                </Stack>
                                            </Box>
                                        ))}
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Box>
                    </Stack>
                )}
            </Box>

            {/* Create Dialog */}
            <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth='xs' fullWidth>
                <DialogTitle>{t('pet.createPet')}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        <TextField label={t('pet.name')} value={createName} onChange={(e) => setCreateName(e.target.value)} fullWidth />
                        <FormControl fullWidth>
                            <InputLabel>{t('pet.language')}</InputLabel>
                            <Select value={createLang} label={t('pet.language')} onChange={(e) => setCreateLang(e.target.value)}>
                                <MenuItem value='zh'>{t('pet.languageZh')}</MenuItem>
                                <MenuItem value='en'>{t('pet.languageEn')}</MenuItem>
                            </Select>
                        </FormControl>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCreateOpen(false)}>{t('pet.cancel')}</Button>
                    <Button variant='contained' onClick={handleCreate} disabled={!createName.trim()}>
                        {t('pet.save')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Feed Card Dialog */}
            <Dialog open={feedOpen} onClose={() => setFeedOpen(false)} maxWidth='sm' fullWidth>
                <DialogTitle>{t('pet.feedCard')}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        <FormControl fullWidth>
                            <InputLabel>{t('pet.cardType')}</InputLabel>
                            <Select value={feedType} label={t('pet.cardType')} onChange={(e) => setFeedType(e.target.value)}>
                                <MenuItem value='vocab'>{t('pet.cardTypeVocab')}</MenuItem>
                                <MenuItem value='phrase'>{t('pet.cardTypePhrase')}</MenuItem>
                                <MenuItem value='action'>{t('pet.cardTypeAction')}</MenuItem>
                            </Select>
                        </FormControl>
                        <TextField
                            label={t('pet.cardInput')}
                            value={feedInput}
                            onChange={(e) => setFeedInput(e.target.value)}
                            fullWidth
                            multiline
                            rows={2}
                        />
                        <TextField
                            label={t('pet.cardOutput')}
                            value={feedOutput}
                            onChange={(e) => setFeedOutput(e.target.value)}
                            fullWidth
                            multiline
                            rows={2}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setFeedOpen(false)}>{t('pet.cancel')}</Button>
                    <Button variant='contained' onClick={handleFeed} disabled={!feedInput.trim() || !feedOutput.trim()}>
                        {t('pet.save')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Link AgentFlow Dialog */}
            <Dialog open={linkOpen} onClose={() => setLinkOpen(false)} maxWidth='sm' fullWidth>
                <DialogTitle>{t('pet.linkFlow')}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        <Typography variant='body2' color='textSecondary'>
                            {t('pet.linkFlowDesc')}
                        </Typography>
                        <FormControl fullWidth>
                            <InputLabel>{t('pet.selectFlow')}</InputLabel>
                            <Select value={selectedFlowId} label={t('pet.selectFlow')} onChange={(e) => setSelectedFlowId(e.target.value)}>
                                <MenuItem value=''>
                                    <em>{t('pet.noFlow')}</em>
                                </MenuItem>
                                {agentflows.map((f) => (
                                    <MenuItem key={f.id} value={f.id}>
                                        {f.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setLinkOpen(false)}>{t('pet.cancel')}</Button>
                    <Button variant='contained' onClick={handleLinkFlow}>
                        {t('pet.save')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Delete Confirm */}
            <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth='xs'>
                <DialogTitle>{t('pet.deletePet')}</DialogTitle>
                <DialogContent>
                    <Typography>{t('pet.confirmDelete')}</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteOpen(false)}>{t('pet.cancel')}</Button>
                    <Button variant='contained' color='error' onClick={handleDelete}>
                        {t('pet.deletePet')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* TTS Settings Dialog */}
            <Dialog open={ttsSettingsOpen} onClose={() => setTtsSettingsOpen(false)} maxWidth='xs' fullWidth>
                <DialogTitle>{t('tts.settings')}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2.5} sx={{ mt: 1 }}>
                        {!ttsSupported && (
                            <Typography variant='body2' color='warning.main'>
                                {t('tts.notSupported')}
                            </Typography>
                        )}
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={ttsSettings.enabled}
                                    onChange={(e) => updateTtsSettings({ enabled: e.target.checked })}
                                    disabled={!ttsSupported}
                                />
                            }
                            label={t('tts.enableVoice')}
                        />
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={ttsSettings.autoPlay}
                                    onChange={(e) => updateTtsSettings({ autoPlay: e.target.checked })}
                                    disabled={!ttsSupported || !ttsSettings.enabled}
                                />
                            }
                            label={t('tts.autoPlay')}
                        />
                        <FormControl fullWidth size='small' disabled={!ttsSupported}>
                            <InputLabel>{t('tts.engine')}</InputLabel>
                            <Select
                                value={ttsSettings.engine}
                                label={t('tts.engine')}
                                onChange={(e) => updateTtsSettings({ engine: e.target.value })}
                            >
                                <MenuItem value='webSpeech'>{t('tts.engineWebSpeech')}</MenuItem>
                                <MenuItem value='edge' disabled>
                                    {t('tts.engineEdge')}
                                </MenuItem>
                                <MenuItem value='openai' disabled>
                                    {t('tts.engineOpenAI')}
                                </MenuItem>
                            </Select>
                        </FormControl>
                        {voices.length > 0 && (
                            <FormControl fullWidth size='small' disabled={!ttsSupported || !ttsSettings.enabled}>
                                <InputLabel>{t('tts.voice')}</InputLabel>
                                <Select
                                    value={ttsSettings.voiceName}
                                    label={t('tts.voice')}
                                    onChange={(e) => updateTtsSettings({ voiceName: e.target.value })}
                                >
                                    <MenuItem value=''>
                                        <em>{t('tts.voiceDefault')}</em>
                                    </MenuItem>
                                    {voices.map((v) => (
                                        <MenuItem key={v.name} value={v.name}>
                                            {v.name} ({v.lang})
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}
                        <Box>
                            <Typography variant='body2' gutterBottom>
                                {t('tts.rate')} {ttsSettings.rate.toFixed(1)}
                            </Typography>
                            <Slider
                                value={ttsSettings.rate}
                                min={0.5}
                                max={2}
                                step={0.1}
                                onChange={(_, v) => updateTtsSettings({ rate: v })}
                                disabled={!ttsSupported || !ttsSettings.enabled}
                                size='small'
                            />
                        </Box>
                        <Box>
                            <Typography variant='body2' gutterBottom>
                                {t('tts.pitch')} {ttsSettings.pitch.toFixed(1)}
                            </Typography>
                            <Slider
                                value={ttsSettings.pitch}
                                min={0.5}
                                max={2}
                                step={0.1}
                                onChange={(_, v) => updateTtsSettings({ pitch: v })}
                                disabled={!ttsSupported || !ttsSettings.enabled}
                                size='small'
                            />
                        </Box>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setTtsSettingsOpen(false)}>{t('pet.cancel')}</Button>
                </DialogActions>
            </Dialog>
        </MainCard>
    )
}

export default PetPage
