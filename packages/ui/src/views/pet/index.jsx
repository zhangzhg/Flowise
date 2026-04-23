import { useEffect, useState, useRef } from 'react'
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
    InputLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography,
    Paper,
    List,
    ListItem,
    ListItemText,
    Tooltip
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { IconSend, IconPlus, IconTrash, IconCards, IconLink, IconLinkOff } from '@tabler/icons-react'
import { useDispatch } from 'react-redux'
import { enqueueSnackbar as enqueueSnackbarAction } from '@/store/actions'
import useNotifier from '@/utils/useNotifier'
import MainCard from '@/ui-component/cards/MainCard'
import ViewHeader from '@/layout/MainLayout/ViewHeader'
import petApi from '@/api/pet'
import chatflowsApi from '@/api/chatflows'
import predictionApi from '@/api/prediction'
import { v4 as uuidv4 } from 'uuid'

const STAGE_LABELS = { egg: 'stageEgg', babble: 'stageBabble', echo: 'stageEcho', talk: 'stageTalk', mature: 'stageMature' }

function deriveStage(cardCount) {
    if (cardCount >= 500) return 'mature'
    if (cardCount >= 100) return 'talk'
    if (cardCount >= 20) return 'echo'
    if (cardCount >= 1) return 'babble'
    return 'egg'
}

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
            setChatHistory((h) => [...h, { role: 'assistant', content: answer }])
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
    const stage = deriveStage(cardCount)

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
                    <Stack spacing={2}>
                        {/* Pet Info */}
                        <Card variant='outlined'>
                            <CardContent>
                                <Stack direction='row' alignItems='center' justifyContent='space-between' flexWrap='wrap' gap={1}>
                                    <Stack spacing={1}>
                                        <Typography variant='h4'>{pet.name}</Typography>
                                        <Stack direction='row' spacing={1} flexWrap='wrap'>
                                            <Chip label={t(`pet.${STAGE_LABELS[stage]}`)} color='primary' size='small' />
                                            <Chip label={`Lv.${attrs.level ?? 1}`} size='small' />
                                            <Chip label={`${t('pet.cardCount')}: ${cardCount}`} size='small' variant='outlined' />
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
                            </CardContent>
                        </Card>

                        {/* Chat Area */}
                        <Card variant='outlined'>
                            <CardContent>
                                <Typography variant='subtitle1' gutterBottom>
                                    {t('pet.chat')}
                                </Typography>
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
                                            <ListItem key={i} sx={{ justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
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
                                        fullWidth
                                        size='small'
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleChat()}
                                        placeholder={pet.petFlowId ? t('pet.chat') : t('pet.linkFlowFirst')}
                                        disabled={!pet.petFlowId || chatting}
                                    />
                                    <Button
                                        variant='contained'
                                        onClick={handleChat}
                                        disabled={!pet.petFlowId || chatting || !chatInput.trim()}
                                        endIcon={<IconSend />}
                                    >
                                        {t('pet.send')}
                                    </Button>
                                </Stack>
                            </CardContent>
                        </Card>
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
        </MainCard>
    )
}

export default PetPage
