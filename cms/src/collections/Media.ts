import { APIError, type Access, type CollectionConfig } from 'payload'
import sharp from 'sharp'

// Same set as lib/imageType.js in the app.
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

const signedIn: Access = ({ req }) => Boolean(req.user)

/**
 * Images and videos uploaded by the app (avatars, lesson media), stored in MinIO by the s3Storage
 * plugin (payload.config.ts). `key` is the stable logical name callers look a file up by.
 * Files are public: read needs no login; writing needs a signed-in user or API key.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  admin: { useAsTitle: 'key', defaultColumns: ['key', 'purpose', 'mimeType', 'filesize'] },
  access: { read: () => true, create: signedIn, update: signedIn, delete: signedIn },
  upload: {
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'video/mp4', 'video/webm'],
  },
  hooks: {
    beforeOperation: [
      async ({ args, operation }) => {
        const { req } = args
        const file = req?.file
        if ((operation !== 'create' && operation !== 'update') || !file) return
        const { id } = args as { id?: number | string }
        let isAvatar = args.data?.purpose === 'avatar'
        // An update may change the purpose while replacing the file: a stored avatar stays an avatar.
        if (!isAvatar && operation === 'update' && id) {
          isAvatar = (await req.payload.findByID({ collection: 'media', id, depth: 0, req })).purpose === 'avatar'
        }
        if (!isAvatar) return
        if (!AVATAR_TYPES.includes(file.mimetype)) {
          throw new APIError(`Avatars must be ${AVATAR_TYPES.join(', ')}; got ${file.mimetype}.`, 400)
        }
        file.data = await sharp(file.data, { animated: true })
          .rotate()
          .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
          .toBuffer()
        file.size = file.data.length
      },
    ],
  },
  fields: [
    { name: 'key', type: 'text', required: true, unique: true, index: true },
    { name: 'purpose', type: 'select', required: true, options: ['content', 'avatar'] },
    { name: 'alt', type: 'text' },
  ],
}
