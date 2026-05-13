import { useEffect, useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import {
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    FormLabel,
    Grid,
    IconButton,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Radio,
    RadioGroup,
    Skeleton,
    Stack,
    Switch,
    TextField,
    Tooltip,
    Typography
} from '@mui/material'
import {
    IconPlug,
    IconTrash,
    IconRefresh,
    IconFolder,
    IconFolderOpen,
    IconArrowUp,
    IconCheck,
    IconDeviceDesktop
} from '@tabler/icons-react'
import { useDispatch } from 'react-redux'
import { enqueueSnackbar as enqueueSnackbarAction, closeSnackbar as closeSnackbarAction } from '@/store/actions'
import pluginsApi from '@/api/plugins'
import MainCard from '@/ui-component/cards/MainCard'

const DRIVES_SENTINEL = '__drives__'

// ── Folder Browser Dialog ──────────────────────────────────────────────────────

const FolderBrowser = ({ open, onClose, onSelect, initialPath }) => {
    FolderBrowser.propTypes = {
        open: PropTypes.bool.isRequired,
        onClose: PropTypes.func.isRequired,
        onSelect: PropTypes.func.isRequired,
        initialPath: PropTypes.string
    }
    const [current, setCurrent] = useState('')
    const [parent, setParent] = useState(null)
    const [dirs, setDirs] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const navigate = useCallback(async (targetPath) => {
        // null/undefined/sentinel → drives view; empty string → server CWD
        const requestPath = targetPath === null || targetPath === undefined || targetPath === DRIVES_SENTINEL ? DRIVES_SENTINEL : targetPath
        setLoading(true)
        setError('')
        try {
            const res = await pluginsApi.browseDirectory(requestPath)
            if (typeof res.data !== 'object' || res.data === null) {
                setError('Browse API not available — please restart the server and try again.')
                setDirs([])
                return
            }
            const data = res.data
            setCurrent(data.current ?? requestPath)
            setParent(data.parent ?? null)
            setDirs(Array.isArray(data.dirs) ? data.dirs : [])
        } catch (err) {
            setError(err?.response?.data?.message ?? 'Cannot read directory')
            setDirs([])
        } finally {
            setLoading(false)
        }
    }, [])

    // Load when dialog opens — start from initialPath if provided, else server CWD
    useEffect(() => {
        if (open) {
            navigate(initialPath || '')
        }
    }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

    const isDrivesView = current === DRIVES_SENTINEL

    const getChildPath = (dir) => {
        if (isDrivesView) return dir // dir is already a full drive path like "C:\"
        const sep = current.includes('\\') ? '\\' : '/'
        return current.endsWith(sep) ? `${current}${dir}` : `${current}${sep}${dir}`
    }

    return (
        <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
            <DialogTitle>Select Folder</DialogTitle>
            <DialogContent sx={{ pb: 0 }}>
                <Stack spacing={1.5}>
                    <Stack direction='row' spacing={1} alignItems='center'>
                        <Tooltip title={isDrivesView ? 'Already at top' : 'Go up'}>
                            <span>
                                <IconButton size='small' disabled={parent === null || loading} onClick={() => navigate(parent)}>
                                    <IconArrowUp size={18} />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <TextField
                            value={isDrivesView ? 'My Computer' : current}
                            onChange={(e) => setCurrent(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && navigate(current)}
                            size='small'
                            fullWidth
                            placeholder='Type a path and press Enter'
                            inputProps={{ style: { fontFamily: 'monospace', fontSize: 13 }, readOnly: isDrivesView }}
                        />
                    </Stack>

                    {error && (
                        <Typography color='error' variant='caption'>
                            {error}
                        </Typography>
                    )}

                    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, height: 300, overflow: 'auto' }}>
                        {loading ? (
                            <Stack spacing={0.5} p={1}>
                                {[1, 2, 3, 4].map((i) => (
                                    <Skeleton key={i} height={36} variant='rounded' />
                                ))}
                            </Stack>
                        ) : dirs.length === 0 ? (
                            <Box display='flex' alignItems='center' justifyContent='center' height='100%'>
                                <Typography color='text.secondary' variant='caption'>
                                    No subdirectories
                                </Typography>
                            </Box>
                        ) : (
                            <List dense disablePadding>
                                {dirs.map((dir) => (
                                    <ListItemButton key={dir} onClick={() => navigate(getChildPath(dir))}>
                                        <ListItemIcon sx={{ minWidth: 32 }}>
                                            {isDrivesView ? <IconDeviceDesktop size={16} /> : <IconFolder size={16} />}
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={isDrivesView ? dir.replace(':\\', ':') : dir}
                                            primaryTypographyProps={{ variant: 'body2', fontFamily: 'monospace' }}
                                        />
                                    </ListItemButton>
                                ))}
                            </List>
                        )}
                    </Box>

                    <Typography variant='caption' color='text.secondary'>
                        Click a folder to navigate into it. Press Enter in the path field to jump directly.
                    </Typography>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    variant='contained'
                    startIcon={<IconCheck size={16} />}
                    disabled={!current || isDrivesView}
                    onClick={() => {
                        onSelect(current)
                        onClose()
                    }}
                >
                    Select This Folder
                </Button>
            </DialogActions>
        </Dialog>
    )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

const Plugins = () => {
    const dispatch = useDispatch()
    const enqueueSnackbar = (...args) => dispatch(enqueueSnackbarAction(...args))
    const closeSnackbar = (...args) => dispatch(closeSnackbarAction(...args))

    const [plugins, setPlugins] = useState([])
    const [isLoading, setLoading] = useState(true)
    const [installOpen, setInstallOpen] = useState(false)
    const [installSource, setInstallSource] = useState('npm')
    const [installValue, setInstallValue] = useState('')
    const [installing, setInstalling] = useState(false)
    const [folderBrowserOpen, setFolderBrowserOpen] = useState(false)

    const fetchPlugins = useCallback(async () => {
        setLoading(true)
        try {
            const res = await pluginsApi.getAllPlugins()
            setPlugins(Array.isArray(res.data) ? res.data : [])
        } catch {
            setPlugins([])
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchPlugins()
    }, [fetchPlugins])

    const handleInstall = async () => {
        if (!installValue.trim()) return
        setInstalling(true)
        try {
            const body =
                installSource === 'npm' ? { source: 'npm', name: installValue.trim() } : { source: 'local', path: installValue.trim() }
            const res = await pluginsApi.installPlugin(body)
            const loaded = res?.data?.loadedNodeCount
            const msg = typeof loaded === 'number' ? `Plugin installed — ${loaded} node(s) loaded` : 'Plugin installed successfully'
            enqueueSnackbar({ message: msg, options: { variant: 'success' } })
            setInstallOpen(false)
            setInstallValue('')
            await fetchPlugins()
        } catch (err) {
            enqueueSnackbar({
                message: err?.response?.data?.message ?? 'Install failed',
                options: { variant: 'error', persist: true, action: (key) => <Button onClick={() => closeSnackbar(key)}>Dismiss</Button> }
            })
        } finally {
            setInstalling(false)
        }
    }

    const handleToggle = async (plugin) => {
        try {
            await pluginsApi.updatePlugin(plugin.id, { enabled: !plugin.enabled })
            enqueueSnackbar({ message: `Plugin ${!plugin.enabled ? 'enabled' : 'disabled'}`, options: { variant: 'success' } })
            await fetchPlugins()
        } catch (err) {
            enqueueSnackbar({ message: err?.response?.data?.message ?? 'Update failed', options: { variant: 'error' } })
        }
    }

    const handleUninstall = async (plugin) => {
        if (!window.confirm(`Uninstall plugin "${plugin.name}"? This cannot be undone.`)) return
        try {
            await pluginsApi.uninstallPlugin(plugin.id)
            enqueueSnackbar({ message: 'Plugin uninstalled', options: { variant: 'success' } })
            await fetchPlugins()
        } catch (err) {
            enqueueSnackbar({ message: err?.response?.data?.message ?? 'Uninstall failed', options: { variant: 'error' } })
        }
    }

    return (
        <MainCard>
            <Stack direction='row' justifyContent='space-between' alignItems='center' mb={3}>
                <Box>
                    <Typography variant='h3'>Plugins</Typography>
                    <Typography variant='body2' color='text.secondary' mt={0.5}>
                        Extend Flowise with additional node packages
                    </Typography>
                </Box>
                <Stack direction='row' spacing={1}>
                    <Tooltip title='Refresh'>
                        <IconButton onClick={fetchPlugins} size='small'>
                            <IconRefresh size={18} />
                        </IconButton>
                    </Tooltip>
                    <Button variant='contained' startIcon={<IconPlug size={18} />} onClick={() => setInstallOpen(true)}>
                        Install Plugin
                    </Button>
                </Stack>
            </Stack>

            {isLoading ? (
                <Grid container spacing={2}>
                    {[1, 2, 3].map((i) => (
                        <Grid item xs={12} md={6} lg={4} key={i}>
                            <Skeleton variant='rounded' height={140} />
                        </Grid>
                    ))}
                </Grid>
            ) : plugins.length === 0 ? (
                <Box display='flex' flexDirection='column' alignItems='center' py={8} gap={1}>
                    <IconPlug size={48} stroke={1} color='#aaa' />
                    <Typography color='text.secondary'>No plugins installed</Typography>
                    <Button variant='outlined' size='small' onClick={() => setInstallOpen(true)} sx={{ mt: 1 }}>
                        Install your first plugin
                    </Button>
                </Box>
            ) : (
                <Grid container spacing={2}>
                    {plugins.map((plugin) => (
                        <Grid item xs={12} md={6} lg={4} key={plugin.id}>
                            <Card variant='outlined' sx={{ height: '100%' }}>
                                <CardContent>
                                    <Stack direction='row' justifyContent='space-between' alignItems='flex-start'>
                                        <Box flex={1} minWidth={0}>
                                            <Typography variant='h5' noWrap>
                                                {plugin.displayName || plugin.name}
                                            </Typography>
                                            <Typography variant='caption' color='text.secondary' noWrap display='block'>
                                                {plugin.name}
                                            </Typography>
                                        </Box>
                                        <Chip
                                            size='small'
                                            label={plugin.enabled ? 'Enabled' : 'Disabled'}
                                            color={plugin.enabled ? 'success' : 'default'}
                                            sx={{ ml: 1, flexShrink: 0 }}
                                        />
                                    </Stack>

                                    {plugin.description && (
                                        <Typography
                                            variant='body2'
                                            color='text.secondary'
                                            mt={1}
                                            sx={{
                                                display: '-webkit-box',
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical',
                                                overflow: 'hidden'
                                            }}
                                        >
                                            {plugin.description}
                                        </Typography>
                                    )}

                                    <Stack direction='row' justifyContent='space-between' alignItems='center' mt={2}>
                                        <Typography variant='caption' color='text.secondary'>
                                            {plugin.version ? `v${plugin.version}` : '—'}
                                        </Typography>
                                        <Stack direction='row' spacing={0.5} alignItems='center'>
                                            <FormControlLabel
                                                control={
                                                    <Switch size='small' checked={plugin.enabled} onChange={() => handleToggle(plugin)} />
                                                }
                                                label=''
                                                sx={{ mr: 0 }}
                                            />
                                            <Tooltip title='Uninstall'>
                                                <IconButton size='small' color='error' onClick={() => handleUninstall(plugin)}>
                                                    <IconTrash size={16} />
                                                </IconButton>
                                            </Tooltip>
                                        </Stack>
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}

            {/* Install Dialog */}
            <Dialog open={installOpen} onClose={() => setInstallOpen(false)} maxWidth='sm' fullWidth>
                <DialogTitle>Install Plugin</DialogTitle>
                <DialogContent>
                    <Stack spacing={3} mt={1}>
                        <FormControl>
                            <FormLabel>Source</FormLabel>
                            <RadioGroup
                                row
                                value={installSource}
                                onChange={(e) => {
                                    setInstallSource(e.target.value)
                                    setInstallValue('')
                                }}
                            >
                                <FormControlLabel value='npm' control={<Radio size='small' />} label='npm package (pre-installed)' />
                                <FormControlLabel value='local' control={<Radio size='small' />} label='Local folder' />
                            </RadioGroup>
                        </FormControl>

                        {installSource === 'npm' ? (
                            <TextField
                                label='Package Name'
                                placeholder='@my-org/flowise-plugin-name'
                                value={installValue}
                                onChange={(e) => setInstallValue(e.target.value)}
                                fullWidth
                                size='small'
                                helperText='The npm package must already be installed (pnpm add <name>) before registering here.'
                            />
                        ) : (
                            <Stack direction='row' spacing={1} alignItems='flex-start'>
                                <TextField
                                    label='Plugin Folder Path'
                                    placeholder='C:\path\to\plugin'
                                    value={installValue}
                                    onChange={(e) => setInstallValue(e.target.value)}
                                    fullWidth
                                    size='small'
                                    helperText='Absolute path to the plugin package root containing flowise-plugin.json.'
                                    inputProps={{ style: { fontFamily: 'monospace', fontSize: 13 } }}
                                />
                                <Tooltip title='Browse for folder'>
                                    <IconButton onClick={() => setFolderBrowserOpen(true)} sx={{ mt: 0.5, flexShrink: 0 }}>
                                        <IconFolderOpen size={22} />
                                    </IconButton>
                                </Tooltip>
                            </Stack>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setInstallOpen(false)}>Cancel</Button>
                    <Button variant='contained' onClick={handleInstall} disabled={!installValue.trim() || installing}>
                        {installing ? 'Installing…' : 'Install'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Folder Browser */}
            <FolderBrowser
                open={folderBrowserOpen}
                onClose={() => setFolderBrowserOpen(false)}
                onSelect={(path) => setInstallValue(path)}
                initialPath={installValue}
            />
        </MainCard>
    )
}

export default Plugins
