import { Router, type IRouter } from 'express'
import { cronAuth } from '../middlewares/cronAuth.js'
import { runScheduledPublish } from '../controllers/entries.js'

const router: IRouter = Router()

router.post('/publish', cronAuth, runScheduledPublish)

export default router
