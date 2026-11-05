import type { Access, CollectionConfig } from 'payload'

const signedIn: Access = ({ req }) => Boolean(req.user)

/**
 * Lesson bodies, the same shape as a Sanity `lesson` document (lib/lessonContent.js LESSON_QUERY).
 * `content` is the Portable Text array written by content/tools/build-lesson.mjs, stored as is so
 * the app renders it with the same PortableTextRenderer. Written by content/tools/push-lesson-payload.mjs.
 */
export const Lessons: CollectionConfig = {
  slug: 'lessons',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'sourceId', 'updatedAt'],
  },
  // Lesson bodies of premium courses are not public: every read needs a signed-in user or API key.
  access: { read: signedIn, create: signedIn, update: signedIn, delete: signedIn },
  fields: [
    {
      name: 'sourceId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { description: 'course.lesson.content_source (the Sanity _id), e.g. lesson-dkn-1-1' },
    },
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text' },
    { name: 'description', type: 'textarea' },
    { name: 'estimatedTime', type: 'number', admin: { description: 'Minutes' } },
    { name: 'scenario', type: 'json' },
    { name: 'environmentSetup', type: 'json' },
    { name: 'content', type: 'json', required: true, admin: { description: 'Portable Text blocks' } },
  ],
}
