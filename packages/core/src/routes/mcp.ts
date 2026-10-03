import { Router, type IRouter } from 'express'
import { handleMcpRequest } from '../controllers/mcp.js'
import { mcpToken } from '../middlewares/apiToken.js'
import { validateMcpOrigin } from '../middlewares/mcpOrigin.js'

const router: IRouter = Router()

router.use(validateMcpOrigin)
router.use(mcpToken)

router.get('/', handleMcpRequest)
router.post('/', handleMcpRequest)
router.delete('/', handleMcpRequest)

export default router
