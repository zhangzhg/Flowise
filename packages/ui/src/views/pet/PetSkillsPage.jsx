import { useCallback, useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    IconButton,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography
} from '@mui/material'
import { IconTrash, IconPlus, IconRobot, IconBolt } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import petApi from '@/api/pet'
import toolsApi from '@/api/tools'

const sourceChip = (source, score) =>
    source === 'auto' ? (
        <Tooltip title={`Auto-bound (score: ${score?.toFixed(3) ?? '?'})`}>
            <Chip size='small' icon={<IconBolt size={14} />} label='Auto' color='success' variant='outlined' />
        </Tooltip>
    ) : (
        <Chip size='small' icon={<IconRobot size={14} />} label='Manual' color='primary' variant='outlined' />
    )

const AddBindingDialog = ({ open, onClose, onAdd }) => {
    const { t } = useTranslation()
    const [tools, setTools] = useState([])
    const [intent, setIntent] = useState('')
    const [skillToolId, setSkillToolId] = useState('')
    const [priority, setPriority] = useState(0)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!open) return
        toolsApi.getAllTools().then((res) => setTools(res.data ?? []))
    }, [open])

    const handleAdd = async () => {
        if (!intent.trim() || !skillToolId) return
        setLoading(true)
        try {
            await onAdd({ intent: intent.trim(), skillToolId, priority: Number(priority) })
            setIntent('')
            setSkillToolId('')
            setPriority(0)
            onClose()
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
            <DialogTitle>{t('petSkills.addBinding')}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <TextField
                        label={t('petSkills.intent')}
                        value={intent}
                        onChange={(e) => setIntent(e.target.value)}
                        placeholder='weather'
                        size='small'
                        fullWidth
                    />
                    <TextField
                        select
                        label={t('petSkills.skillTool')}
                        value={skillToolId}
                        onChange={(e) => setSkillToolId(e.target.value)}
                        size='small'
                        fullWidth
                        SelectProps={{ native: true }}
                    >
                        <option value=''>{t('petSkills.selectTool')}</option>
                        {tools.map((tool) => (
                            <option key={tool.id} value={tool.id}>
                                {tool.name}
                            </option>
                        ))}
                    </TextField>
                    <TextField
                        label={t('petSkills.priority')}
                        type='number'
                        value={priority}
                        onChange={(e) => setPriority(e.target.value)}
                        size='small'
                        fullWidth
                    />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t('common.cancel')}</Button>
                <Button variant='contained' onClick={handleAdd} disabled={loading || !intent.trim() || !skillToolId}>
                    {loading ? <CircularProgress size={18} /> : t('common.add')}
                </Button>
            </DialogActions>
        </Dialog>
    )
}

AddBindingDialog.propTypes = {
    open: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onAdd: PropTypes.func.isRequired
}

const PetSkillsPage = ({ petId }) => {
    const { t } = useTranslation()
    const [bindings, setBindings] = useState([])
    const [loading, setLoading] = useState(false)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [toolMap, setToolMap] = useState({})

    const loadBindings = useCallback(async () => {
        if (!petId) return
        setLoading(true)
        try {
            const [bindRes, toolRes] = await Promise.all([petApi.getSkillBindings(petId), toolsApi.getAllTools()])
            const map = {}
            for (const tool of toolRes.data ?? []) map[tool.id] = tool
            setToolMap(map)
            setBindings(bindRes.data ?? [])
        } finally {
            setLoading(false)
        }
    }, [petId])

    useEffect(() => {
        loadBindings()
    }, [loadBindings])

    const handleAdd = async (body) => {
        await petApi.createSkillBinding(petId, body)
        await loadBindings()
    }

    const handleDelete = async (bindingId) => {
        await petApi.deleteSkillBinding(petId, bindingId)
        setBindings((prev) => prev.filter((b) => b.id !== bindingId))
    }

    const autoBindings = bindings.filter((b) => b.source === 'auto')
    const manualBindings = bindings.filter((b) => b.source === 'manual')

    return (
        <Box sx={{ p: 3 }}>
            <Stack direction='row' justifyContent='space-between' alignItems='center' sx={{ mb: 2 }}>
                <Typography variant='h5'>{t('petSkills.title')}</Typography>
                <Button variant='contained' startIcon={<IconPlus size={16} />} onClick={() => setDialogOpen(true)}>
                    {t('petSkills.addBinding')}
                </Button>
            </Stack>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                    <CircularProgress />
                </Box>
            ) : (
                <>
                    {autoBindings.length > 0 && (
                        <>
                            <Typography variant='subtitle2' color='text.secondary' sx={{ mb: 1 }}>
                                {t('petSkills.autoUnlocked')}
                            </Typography>
                            <BindingsTable bindings={autoBindings} toolMap={toolMap} onDelete={handleDelete} />
                            <Divider sx={{ my: 3 }} />
                        </>
                    )}
                    <Typography variant='subtitle2' color='text.secondary' sx={{ mb: 1 }}>
                        {t('petSkills.manualBindings')}
                    </Typography>
                    {manualBindings.length === 0 ? (
                        <Paper variant='outlined' sx={{ p: 3, textAlign: 'center' }}>
                            <Typography color='text.secondary'>{t('petSkills.noManualBindings')}</Typography>
                        </Paper>
                    ) : (
                        <BindingsTable bindings={manualBindings} toolMap={toolMap} onDelete={handleDelete} />
                    )}
                </>
            )}

            <AddBindingDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onAdd={handleAdd} />
        </Box>
    )
}

PetSkillsPage.propTypes = {
    petId: PropTypes.string.isRequired
}

const BindingsTable = ({ bindings, toolMap, onDelete }) => {
    const { t } = useTranslation()
    return (
        <TableContainer component={Paper} variant='outlined'>
            <Table size='small'>
                <TableHead>
                    <TableRow>
                        <TableCell>{t('petSkills.intent')}</TableCell>
                        <TableCell>{t('petSkills.skillTool')}</TableCell>
                        <TableCell>{t('petSkills.source')}</TableCell>
                        <TableCell align='right'>{t('petSkills.priority')}</TableCell>
                        <TableCell />
                    </TableRow>
                </TableHead>
                <TableBody>
                    {bindings.map((b) => (
                        <TableRow key={b.id} hover>
                            <TableCell>
                                <Chip size='small' label={b.intent} />
                            </TableCell>
                            <TableCell>{toolMap[b.skillToolId]?.name ?? b.skillToolId}</TableCell>
                            <TableCell>{sourceChip(b.source, b.autoBindScore)}</TableCell>
                            <TableCell align='right'>{b.priority}</TableCell>
                            <TableCell align='right'>
                                <IconButton size='small' color='error' onClick={() => onDelete(b.id)}>
                                    <IconTrash size={16} />
                                </IconButton>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    )
}

BindingsTable.propTypes = {
    bindings: PropTypes.arrayOf(
        PropTypes.shape({
            id: PropTypes.string.isRequired,
            intent: PropTypes.string.isRequired,
            skillToolId: PropTypes.string.isRequired,
            source: PropTypes.string.isRequired,
            autoBindScore: PropTypes.number,
            priority: PropTypes.number.isRequired
        })
    ).isRequired,
    toolMap: PropTypes.object.isRequired,
    onDelete: PropTypes.func.isRequired
}

export default PetSkillsPage
