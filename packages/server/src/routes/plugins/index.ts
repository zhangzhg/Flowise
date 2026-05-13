import express from 'express'
import pluginsController from '../../controllers/plugins'

const router = express.Router()

router.get('/', pluginsController.getAllPlugins)
router.get('/browse', pluginsController.browseDirectory)
router.get('/:id', pluginsController.getPluginById)
router.post('/', pluginsController.installPlugin)
router.patch('/:id', pluginsController.updatePlugin)
router.delete('/:id', pluginsController.uninstallPlugin)

export default router
