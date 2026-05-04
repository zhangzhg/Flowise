import express from 'express'
import petController from '../../controllers/pet'
import { checkAnyPermission, checkPermission } from '../../enterprise/rbac/PermissionCheck'

const router = express.Router()

// Pet CRUD on the caller's own pet
router.get('/me', checkPermission('pet:view'), petController.getMyPet)
router.post('/me', checkPermission('pet:create'), petController.createMyPet)
router.put('/me', checkAnyPermission('pet:update,pet:create'), petController.updateMyPet)
router.delete('/me', checkPermission('pet:delete'), petController.deleteMyPet)

// Card operations
router.post('/me/cards', checkAnyPermission('pet:teach,pet:update'), petController.feedCard)
router.get('/me/cards', checkPermission('pet:view'), petController.listCards)

// Agent-created schedules (called by `schedule` tool from inside Pet flow)
router.post('/me/schedules', checkAnyPermission('pet:teach,pet:update'), petController.createMySchedule)
router.get('/me/schedules', checkPermission('pet:view'), petController.listMySchedules)
router.delete('/me/schedules/:name', checkAnyPermission('pet:teach,pet:update'), petController.cancelMySchedule)

export default router
