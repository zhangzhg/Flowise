import { IComponentNodes, IComponentCredentials } from './Interface'
import path from 'path'
import { Dirent } from 'fs'
import { getNodeModulesPackagePath } from './utils'
import { promises } from 'fs'
import { ICommonObject, mergePluginTranslations } from 'flowise-components'
import logger from './utils/logger'
import { appConfig } from './AppConfig'

export interface IPlugin {
    id: string
    name: string
    installPath: string
    i18nPath?: string | null
    enabled: boolean
}

export class NodesPool {
    componentNodes: IComponentNodes = {}
    componentCredentials: IComponentCredentials = {}
    private credentialIconPath: ICommonObject = {}
    private pluginNodeNames: Map<string, string[]> = new Map()

    /**
     * Initialize to get all nodes & credentials
     */
    async initialize() {
        await this.initializeNodes()
        await this.initializeCredentials()
    }

    /**
     * Initialize nodes
     */
    private async initializeNodes() {
        const packagePath = getNodeModulesPackagePath('flowise-components')
        const nodesPath = path.join(packagePath, 'dist', 'nodes')
        const nodes = await this.loadNodesFromDir(nodesPath)
        Object.assign(this.componentNodes, nodes)
    }

    /**
     * Load and filter nodes from a directory.
     */
    async loadNodesFromDir(dir: string): Promise<IComponentNodes> {
        const disabled_nodes = process.env.DISABLED_NODES ? process.env.DISABLED_NODES.split(',') : []
        const nodes: IComponentNodes = {}
        const nodeFiles = await this.getFiles(dir)
        await Promise.all(
            nodeFiles.map(async (file) => {
                if (file.endsWith('.js')) {
                    try {
                        const nodeModule = await require(file)

                        if (nodeModule.nodeClass) {
                            const newNodeInstance = new nodeModule.nodeClass()
                            newNodeInstance.filePath = file

                            // Replace file icon with absolute path
                            if (
                                newNodeInstance.icon &&
                                (newNodeInstance.icon.endsWith('.svg') ||
                                    newNodeInstance.icon.endsWith('.png') ||
                                    newNodeInstance.icon.endsWith('.jpg'))
                            ) {
                                const filePath = file.replace(/\\/g, '/').split('/')
                                filePath.pop()
                                const nodeIconAbsolutePath = `${filePath.join('/')}/${newNodeInstance.icon}`
                                newNodeInstance.icon = nodeIconAbsolutePath

                                // Store icon path for componentCredentials
                                if (newNodeInstance.credential) {
                                    for (const credName of newNodeInstance.credential.credentialNames) {
                                        this.credentialIconPath[credName] = nodeIconAbsolutePath
                                    }
                                }
                            }

                            const skipCategories = ['Analytic', 'SpeechToText']
                            const conditionOne = !skipCategories.includes(newNodeInstance.category)

                            const isCommunityNodesAllowed = appConfig.showCommunityNodes
                            const isAuthorPresent = newNodeInstance.author
                            let conditionTwo = true
                            if (!isCommunityNodesAllowed && isAuthorPresent) conditionTwo = false

                            const isDisabled = disabled_nodes.includes(newNodeInstance.name)

                            if (conditionOne && conditionTwo && !isDisabled) {
                                nodes[newNodeInstance.name] = newNodeInstance
                            }
                        }
                    } catch (err) {
                        logger.error(`❌ [server]: Error during initDatabase with file ${file}:`, err)
                    }
                }
            })
        )
        return nodes
    }

    /**
     * Hot-load a plugin's nodes into the pool and merge its i18n translations.
     * Idempotent: re-loading the same plugin replaces its previous nodes.
     */
    async loadPlugin(plugin: IPlugin): Promise<void> {
        if (!plugin.enabled) return

        // Unload existing nodes for this plugin first (handles reload scenario)
        this.unloadPlugin(plugin.id)

        const nodes = await this.loadNodesFromDir(plugin.installPath)
        const loadedNames = Object.keys(nodes)
        Object.assign(this.componentNodes, nodes)
        this.pluginNodeNames.set(plugin.id, loadedNames)

        if (plugin.i18nPath) {
            await this.mergePluginI18n(plugin.i18nPath)
        }

        logger.info(`🔌 [plugin]: Loaded ${loadedNames.length} node(s) from plugin "${plugin.name}"`)
    }

    /**
     * Return the number of nodes currently loaded for a given plugin.
     */
    pluginNodeCount(pluginId: string): number {
        return (this.pluginNodeNames.get(pluginId) ?? []).length
    }

    /**
     * Remove a plugin's nodes from the pool.
     */
    unloadPlugin(pluginId: string): void {
        const names = this.pluginNodeNames.get(pluginId) ?? []
        for (const name of names) {
            delete this.componentNodes[name]
        }
        this.pluginNodeNames.delete(pluginId)
    }

    /**
     * Load all enabled plugins. Called once during server init.
     */
    async loadAllPlugins(plugins: IPlugin[]): Promise<void> {
        for (const plugin of plugins) {
            if (plugin.enabled) {
                try {
                    await this.loadPlugin(plugin)
                } catch (err) {
                    logger.error(`❌ [plugin]: Failed to load plugin "${plugin.name}":`, err)
                }
            }
        }
    }

    /**
     * Initialize credentials
     */
    private async initializeCredentials() {
        const packagePath = getNodeModulesPackagePath('flowise-components')
        const nodesPath = path.join(packagePath, 'dist', 'credentials')
        const nodeFiles = await this.getFiles(nodesPath)
        return Promise.all(
            nodeFiles.map(async (file) => {
                if (file.endsWith('.credential.js')) {
                    const credentialModule = await require(file)
                    if (credentialModule.credClass) {
                        const newCredInstance = new credentialModule.credClass()
                        newCredInstance.icon = this.credentialIconPath[newCredInstance.name] ?? ''
                        this.componentCredentials[newCredInstance.name] = newCredInstance
                    }
                }
            })
        )
    }

    private async mergePluginI18n(i18nPath: string): Promise<void> {
        try {
            const [enRaw, zhRaw] = await Promise.all([
                promises.readFile(path.join(i18nPath, 'en.json'), 'utf-8').catch(() => '{}'),
                promises.readFile(path.join(i18nPath, 'zh.json'), 'utf-8').catch(() => '{}')
            ])
            mergePluginTranslations(JSON.parse(enRaw), JSON.parse(zhRaw))
        } catch (err) {
            logger.warn(`⚠️  [plugin]: Could not merge i18n from "${i18nPath}":`, err)
        }
    }

    /**
     * Recursive function to get node files
     * @param {string} dir
     * @returns {string[]}
     */
    private async getFiles(dir: string): Promise<string[]> {
        const dirents = await promises.readdir(dir, { withFileTypes: true })
        const files = await Promise.all(
            dirents.map((dirent: Dirent) => {
                const res = path.resolve(dir, dirent.name)
                return dirent.isDirectory() ? this.getFiles(res) : res
            })
        )
        return Array.prototype.concat(...files)
    }
}
