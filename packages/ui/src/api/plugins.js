import client from './client'

const getAllPlugins = () => client.get('/plugins')
const getPluginById = (id) => client.get(`/plugins/${id}`)
const installPlugin = (body) => client.post('/plugins', body)
const updatePlugin = (id, body) => client.patch(`/plugins/${id}`, body)
const uninstallPlugin = (id) => client.delete(`/plugins/${id}`)
const browseDirectory = (path) => client.get('/plugins/browse', { params: { path } })

export default {
    getAllPlugins,
    getPluginById,
    installPlugin,
    updatePlugin,
    uninstallPlugin,
    browseDirectory
}
