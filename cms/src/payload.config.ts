import { postgresAdapter } from '@payloadcms/db-postgres'
import { s3Storage } from '@payloadcms/storage-s3'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { Lessons } from './collections/Lessons'
import { Media } from './collections/Media'
import { Users } from './collections/Users'
import { migrations } from './migrations'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
  },
  collections: [Users, Lessons, Media],
  sharp,
  upload: { limits: { fileSize: 200 * 1024 * 1024 } },
  // Media files live in MinIO (compose.yml `minio`); the app reads them through /api/media/file/<name>.
  plugins: [
    s3Storage({
      collections: { media: true },
      bucket: process.env.S3_MEDIA_BUCKET || 'media',
      config: {
        endpoint: process.env.MINIO_ENDPOINT,
        region: process.env.MINIO_REGION || 'us-east-1',
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.MINIO_ACCESS_KEY || process.env.MINIO_ROOT_USER || '',
          secretAccessKey: process.env.MINIO_SECRET_KEY || process.env.MINIO_ROOT_PASSWORD || '',
        },
      },
    }),
  ],
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URI || '' },
    // The image runs with NODE_ENV=production, where Payload never pushes the schema:
    // the committed migrations (src/migrations) run when the server starts.
    prodMigrations: migrations,
  }),
  // First start: one admin user whose API key the CodeDev app and the push tool use.
  // Values come from the container environment (compose.yml, .env.local); nothing is baked in.
  onInit: async (payload) => {
    const { CMS_ADMIN_EMAIL, CMS_ADMIN_PASSWORD, CMS_API_KEY } = process.env
    if (!CMS_ADMIN_EMAIL || !CMS_ADMIN_PASSWORD || !CMS_API_KEY) return
    const { totalDocs } = await payload.count({ collection: 'users' })
    if (totalDocs > 0) return
    await payload.create({
      collection: 'users',
      data: { email: CMS_ADMIN_EMAIL, password: CMS_ADMIN_PASSWORD, enableAPIKey: true, apiKey: CMS_API_KEY },
    })
    payload.logger.info(`Created CMS admin ${CMS_ADMIN_EMAIL} with an API key`)
  },
})
