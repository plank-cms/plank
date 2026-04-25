import { Router, type IRouter } from 'express'
import { authenticate } from '../middlewares/authenticate.js'
import { authorize } from '../middlewares/authorize.js'
import {
  listContentTypes,
  getContentType,
  createContentType,
  updateContentType,
  deleteContentType,
  setDefaultContentType,
} from '../controllers/contentTypes.js'
import {
  listEntries,
  getEntry,
  getSingleEntry,
  createEntry,
  updateEntry,
  deleteEntry,
  patchEntryStatus,
} from '../controllers/entries.js'
import { listUsers, createUser, updateUser, deleteUser, getMe, updateMe, changePassword, uploadAvatar, deleteAvatar } from '../controllers/users.js'
import { listRoles, updateRole, resetRoles } from '../controllers/roles.js'
import { listApiTokens, createApiToken, deleteApiToken } from '../controllers/apiTokens.js'
import { uploadMedia, listMedia, deleteMedia, getMediaUrl, presignMedia, completeMedia } from '../controllers/media.js'
import { upload } from '../media/index.js'
import { getNamespaceSettings, updateNamespaceSettings } from '../controllers/settings.js'

const router: IRouter = Router()

router.use(authenticate)

// Content types
router.get('/content-types', authorize('content-types:read'), listContentTypes)
router.post('/content-types', authorize('content-types:write'), createContentType)
router.get('/content-types/:slug', authorize('content-types:read'), getContentType)
router.put('/content-types/:slug', authorize('content-types:write'), updateContentType)
router.put('/content-types/:slug/default', authorize('content-types:write'), setDefaultContentType)
router.delete('/content-types/:slug', authorize('content-types:write'), deleteContentType)

// Entries
router.get('/content-types/:slug/entries', authorize('entries:read'), listEntries)
router.get('/content-types/:slug/single', authorize('entries:read'), getSingleEntry)
router.post('/content-types/:slug/entries', authorize('entries:write'), createEntry)
router.get('/entries/:slug/:id', authorize('entries:read'), getEntry)
router.put('/entries/:slug/:id', authorize('entries:write'), updateEntry)
router.patch('/entries/:slug/:id/status', authorize('entries:write'), patchEntryStatus)
router.delete('/entries/:slug/:id', authorize('entries:write'), deleteEntry)

// Current user profile
router.get('/users/me', getMe)
router.patch('/users/me', updateMe)
router.patch('/users/me/password', changePassword)
router.post('/users/me/avatar', upload.single('file'), uploadAvatar)
router.delete('/users/me/avatar', deleteAvatar)

// Roles
router.get('/roles', authorize('users:read'), listRoles)
router.put('/roles/:id', authorize('users:write'), updateRole)
router.post('/roles/reset', authorize('users:write'), resetRoles)

// Users
router.get('/users', authorize('users:read'), listUsers)
router.post('/users', authorize('users:write'), createUser)
router.put('/users/:id', authorize('users:write'), updateUser)
router.delete('/users/:id', authorize('users:write'), deleteUser)

// API tokens
router.get('/api-tokens', authorize('api-tokens:read'), listApiTokens)
router.post('/api-tokens', authorize('api-tokens:write'), createApiToken)
router.delete('/api-tokens/:id', authorize('api-tokens:write'), deleteApiToken)

// Media
router.get('/media', authorize('media:read'), listMedia)
router.post('/media/presign', authorize('media:write'), presignMedia)
router.post('/media/complete', authorize('media:write'), completeMedia)
router.post('/media', authorize('media:write'), upload.single('file'), uploadMedia)
router.get('/media/:id/url', authorize('media:read'), getMediaUrl)
router.delete('/media/:id', authorize('media:write'), deleteMedia)

// Settings
router.get('/settings/:namespace', authorize('settings:read'), getNamespaceSettings)
router.put('/settings/:namespace', authorize('settings:write'), updateNamespaceSettings)

export default router
