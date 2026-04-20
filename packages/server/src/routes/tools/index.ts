import express from 'express'
import multer from 'multer'
import toolsController from '../../controllers/tools'
import { checkAnyPermission, checkPermission } from '../../enterprise/rbac/PermissionCheck'

const router = express.Router()

// Skill packages are small (< 5 MB). Keep them in memory so the parser can
// read the buffer directly without hitting disk.
const skillUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
})

// CREATE
router.post('/', checkPermission('tools:create'), toolsController.createTool)

// IMPORT SKILL — permission check before multer to reject unauthorized requests before parsing
router.post('/import-skill', checkPermission('tools:create'), skillUpload.single('file'), toolsController.importSkill)

// READ
router.get('/', checkPermission('tools:view'), toolsController.getAllTools)
router.get(['/', '/:id'], checkAnyPermission('tools:view'), toolsController.getToolById)

// UPDATE
router.put(['/', '/:id'], checkAnyPermission('tools:update,tools:create'), toolsController.updateTool)

// DELETE
router.delete(['/', '/:id'], checkPermission('tools:delete'), toolsController.deleteTool)

export default router
