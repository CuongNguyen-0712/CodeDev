import type { Access, CollectionConfig } from 'payload'
import sharp from 'sharp'

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
        const file = args.req?.file
        if (operation !== 'create' || !file || args.data?.purpose !== 'avatar') return
        file.data = await sharp(file.data).resize(512, 512, { fit: 'inside', withoutEnlargement: true }).toBuffer()
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
