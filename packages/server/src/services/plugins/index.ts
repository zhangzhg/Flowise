import path from 'path'
import { promises as fs } from 'fs'
import { StatusCodes } from 'http-status-codes'
import { getRunningExpressApp } from '../../utils/getRunningExpressApp'
import { InternalFlowiseError } from '../../errors/internalFlowiseError'
import { getErrorMessage } from '../../errors/utils'
import { Plugin } from '../../database/entities/Plugin'

interface PluginManifest {
    name: string
    version?: string
    displayName?: string
    description?: string
    nodesDir?: string
    i18nDir?: string
}

async function readManifest(pkgRoot: string): Promise<PluginManifest> {
    const manifestPath = path.join(pkgRoot, 'flowise-plugin.json')
    try {
        const raw = await fs.readFile(manifestPath, 'utf-8')
        return JSON.parse(raw) as PluginManifest
    } catch {
        // Fall back: treat pkg root itself as nodesDir
        let pkgName = path.basename(pkgRoot)
        const pkgJson = JSON.parse(await fs.readFile(path.join(pkgRoot, 'package.json'), 'utf-8'))
        pkgName = pkgJson.name ?? pkgName
        return { name: pkgName, nodesDir: '.' }
    }
}

function resolvePackageRoot(source: 'npm' | 'local', nameOrPath: string): string {
    if (source === 'local') {
        return path.resolve(nameOrPath)
    }
    // npm: resolve via require
    try {
        const pkgJsonPath = require.resolve(`${nameOrPath}/package.json`, { paths: [process.cwd()] })
        return path.dirname(pkgJsonPath)
    } catch {
        throw new InternalFlowiseError(
            StatusCodes.NOT_FOUND,
            `Package "${nameOrPath}" not found. Install it first with: pnpm add ${nameOrPath}`
        )
    }
}

const getAllPlugins = async (): Promise<Plugin[]> => {
    try {
        const appServer = getRunningExpressApp()
        const repo = appServer.AppDataSource.getRepository(Plugin)
        return repo.find({ order: { createdDate: 'ASC' } })
    } catch (error) {
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: pluginsService.getAllPlugins - ${getErrorMessage(error)}`)
    }
}

const getPluginById = async (id: string): Promise<Plugin> => {
    try {
        const appServer = getRunningExpressApp()
        const repo = appServer.AppDataSource.getRepository(Plugin)
        const plugin = await repo.findOne({ where: { id } })
        if (!plugin) throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Plugin ${id} not found`)
        return plugin
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: pluginsService.getPluginById - ${getErrorMessage(error)}`)
    }
}

/**
 * Register a plugin from an npm package name or local filesystem path.
 * The package must already be installed in node_modules (for npm) or present at the path (for local).
 */
const installPlugin = async (source: 'npm' | 'local', nameOrPath: string): Promise<Plugin & { loadedNodeCount: number }> => {
    try {
        const appServer = getRunningExpressApp()
        const repo = appServer.AppDataSource.getRepository(Plugin)

        const pkgRoot = resolvePackageRoot(source, nameOrPath)
        const manifest = await readManifest(pkgRoot)

        const installPath = path.resolve(pkgRoot, manifest.nodesDir ?? 'dist/nodes')
        const i18nPath = manifest.i18nDir ? path.resolve(pkgRoot, manifest.i18nDir) : undefined

        // Check installPath exists
        try {
            await fs.access(installPath)
        } catch {
            throw new InternalFlowiseError(
                StatusCodes.BAD_REQUEST,
                `nodesDir "${installPath}" does not exist. Build the plugin package first.`
            )
        }

        // Upsert: update if already registered, else create
        let plugin = await repo.findOne({ where: { name: manifest.name } })
        if (plugin) {
            plugin.version = manifest.version
            plugin.displayName = manifest.displayName
            plugin.description = manifest.description
            plugin.installPath = installPath
            plugin.i18nPath = i18nPath
            plugin.manifest = JSON.stringify(manifest)
            plugin.enabled = true
        } else {
            plugin = repo.create({
                name: manifest.name,
                displayName: manifest.displayName,
                description: manifest.description,
                version: manifest.version,
                enabled: true,
                installPath,
                i18nPath,
                manifest: JSON.stringify(manifest)
            })
        }

        const saved = await repo.save(plugin)

        // Hot-load into running node pool
        await appServer.nodesPool.loadPlugin(saved)
        const loadedNodeCount = appServer.nodesPool.pluginNodeCount(saved.id)

        return { ...saved, loadedNodeCount }
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(StatusCodes.INTERNAL_SERVER_ERROR, `Error: pluginsService.installPlugin - ${getErrorMessage(error)}`)
    }
}

const setPluginEnabled = async (id: string, enabled: boolean): Promise<Plugin> => {
    try {
        const appServer = getRunningExpressApp()
        const repo = appServer.AppDataSource.getRepository(Plugin)
        const plugin = await repo.findOne({ where: { id } })
        if (!plugin) throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Plugin ${id} not found`)

        plugin.enabled = enabled
        const saved = await repo.save(plugin)

        if (enabled) {
            await appServer.nodesPool.loadPlugin(saved)
        } else {
            appServer.nodesPool.unloadPlugin(id)
        }

        return saved
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: pluginsService.setPluginEnabled - ${getErrorMessage(error)}`
        )
    }
}

const uninstallPlugin = async (id: string): Promise<void> => {
    try {
        const appServer = getRunningExpressApp()
        const repo = appServer.AppDataSource.getRepository(Plugin)
        const plugin = await repo.findOne({ where: { id } })
        if (!plugin) throw new InternalFlowiseError(StatusCodes.NOT_FOUND, `Plugin ${id} not found`)

        appServer.nodesPool.unloadPlugin(id)
        await repo.delete(id)
    } catch (error) {
        if (error instanceof InternalFlowiseError) throw error
        throw new InternalFlowiseError(
            StatusCodes.INTERNAL_SERVER_ERROR,
            `Error: pluginsService.uninstallPlugin - ${getErrorMessage(error)}`
        )
    }
}

const DRIVES_SENTINEL = '__drives__'

async function getWindowsDrives(): Promise<string[]> {
    const results = await Promise.all(
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(async (letter) => {
            const drive = `${letter}:\\`
            try {
                await fs.access(drive)
                return drive
            } catch {
                return null
            }
        })
    )
    return results.filter((d): d is string => d !== null)
}

const browseDirectory = async (dirPath: string): Promise<{ current: string; parent: string | null; dirs: string[] }> => {
    try {
        // Empty path or sentinel → show drives on Windows, / root on Unix
        if (!dirPath || dirPath === DRIVES_SENTINEL) {
            if (process.platform === 'win32') {
                const drives = await getWindowsDrives()
                return { current: DRIVES_SENTINEL, parent: null, dirs: drives }
            }
            return browseDirectory('/')
        }

        const absPath = path.resolve(dirPath)
        const items = await fs.readdir(absPath, { withFileTypes: true })
        const dirs = items
            .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
            .map((d) => d.name)
            .sort((a, b) => a.localeCompare(b))

        // On Windows, detect drive root (e.g. C:\ or C:) — parent goes to drives list
        const isWinDriveRoot = process.platform === 'win32' && /^[A-Z]:\\?$/.test(absPath)
        const parentPath = path.dirname(absPath)
        const parent = isWinDriveRoot ? DRIVES_SENTINEL : parentPath !== absPath ? parentPath : null

        return { current: absPath, parent, dirs }
    } catch (error) {
        throw new InternalFlowiseError(StatusCodes.BAD_REQUEST, `Cannot read directory: ${getErrorMessage(error)}`)
    }
}

export default {
    getAllPlugins,
    getPluginById,
    installPlugin,
    setPluginEnabled,
    uninstallPlugin,
    browseDirectory
}
