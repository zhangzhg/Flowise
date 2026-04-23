import express from 'express'
import schedulesController from '../../controllers/schedules'

const router = express.Router()

router.get('/', schedulesController.getSchedules)
router.get('/:id', schedulesController.getScheduleById)
router.patch('/:id/pause', schedulesController.pauseSchedule)
router.patch('/:id/resume', schedulesController.resumeSchedule)
router.delete('/:id', schedulesController.deleteSchedule)

export default router
