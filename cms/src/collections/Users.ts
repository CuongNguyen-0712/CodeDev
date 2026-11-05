import type { CollectionConfig } from 'payload'

// Admin users. The API key of a user is how the CodeDev app and content/tools read and write lessons.
export const Users: CollectionConfig = {
  slug: 'users',
  auth: { useAPIKey: true },
  admin: { useAsTitle: 'email' },
  fields: [],
}
