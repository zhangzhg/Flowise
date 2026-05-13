import { Request, Response, NextFunction } from 'express'
import { StatusCodes } from 'http-status-codes'
import pluginsService from '../../services/plugins'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'

const getAllPlugins = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const plugins = await pluginsService.getAllPlugins()
        return res.json(plugins)
    } catch (error) {
        next(error)
    }
}

const getPluginById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const plugin = await pluginsService.getPluginById(req.params.id)
        return res.json(plugin)
    } catch (error) {
        next(error)
    }
}

/**
 * POST /api/v1/plugins
 * Body: { source: 'npm' | 'local', name?: string, path?: string }
 *   source='npm'   + name='@my-org/my-plugin'  — resolves via require.resolve (must be pre-installed)
 *   source='local' + path='/abs/path/to/pkg'   — loads from filesystem path
 */
const installPlugin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { source, name, path: localPath } = req.body ?? {}
        if (!source || !['npm', 'local'].includes(source)) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, 'source must be "npm" or "local"')
        }
        const nameOrPath = source === 'npm' ? name : localPath
        if (!nameOrPath) {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, source === 'npm' ? '"name" is required' : '"path" is required')
        }

        const plugin = await pluginsService.installPlugin(source, nameOrPath)
        return res.status(StatusCodes.CREATED).json(plugin)
    } catch (error) {
        next(error)
    }
}

/**
 * PATCH /api/v1/plugins/:id
 * Body: { enabled: boolean }
 */
const updatePlugin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { enabled } = req.body ?? {}
        if (typeof enabled !== 'boolean') {
            throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, '"enabled" (boolean) is required')
        }
        const plugin = await pluginsService.setPluginEnabled(req.params.id, enabled)
        return res.json(plugin)
    } catch (error) {
        next(error)
    }
}

const uninstallPlugin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        await pluginsService.uninstallPlugin(req.params.id)
        return res.json({ success: true })
    } catch (error) {
        next(error)
    }
}

const browseDirectory = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const dirPath = (req.query.path as string) || process.cwd()
        const result = await pluginsService.browseDirectory(dirPath)
        return res.json(result)
    } catch (error) {
        next(error)
    }
}

export default {
    getAllPlugins,
    getPluginById,
    installPlugin,
    updatePlugin,
    uninstallPlugin,
    browseDirectory
}
