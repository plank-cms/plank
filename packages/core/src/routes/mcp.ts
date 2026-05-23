import { Router, type IRouter } from 'express'
import { handleMcpDelete, handleMcpGet, handleMcpRequest } from '../controllers/mcp.js'
import { mcpToken } from '../middlewares/apiToken.js'
import { validateMcpOrigin } from '../middlewares/mcpOrigin.js'

const router: IRouter = Router()

router.use(validateMcpOrigin)
router.use(mcpToken)

router.get('/', handleMcpGet)
router.post('/', handleMcpRequest)
router.delete('/', handleMcpDelete)

export default router
