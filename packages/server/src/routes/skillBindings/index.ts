import express from 'express'
import skillBindingsController from '../../controllers/skillBindings'

const router = express.Router()

// GET  /api/v1/pets/:petId/skill-bindings
router.get('/:petId/skill-bindings', skillBindingsController.getBindings)
// POST /api/v1/pets/:petId/skill-bindings
router.post('/:petId/skill-bindings', skillBindingsController.createBinding)
// DELETE /api/v1/pets/:petId/skill-bindings/:bindingId
router.delete('/:petId/skill-bindings/:bindingId', skillBindingsController.deleteBinding)

export default router
