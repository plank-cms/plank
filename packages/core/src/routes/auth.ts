import { Router, type IRouter } from 'express'
import {
  getAuthFeatures,
  login,
  loginWithTwoFactor,
  logout,
  register,
  requestPasswordReset,
  resetPassword,
  setup,
} from '../controllers/auth.js'

const router: IRouter = Router()

router.get('/setup', setup)
router.get('/features', getAuthFeatures)
router.post('/login', login)
router.post('/login/2fa', loginWithTwoFactor)
router.post('/logout', logout)
router.post('/register', register)
router.post('/password-reset', requestPasswordReset)
router.post('/password-reset/confirm', resetPassword)

export default router
