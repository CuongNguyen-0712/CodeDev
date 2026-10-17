import { createClient } from 'next-sanity'

// Server-side reader (lib/lessonContent.js, behind the course access checks). With
// SANITY_READ_TOKEN (a read-only token) the dataset can be private, so premium lesson bodies are
// only reachable through /api/course/learning. Never import this file from client components.
export const client = createClient({
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
    apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION,
    useCdn: process.env.NODE_ENV === 'production',
    ...(process.env.SANITY_READ_TOKEN ? { token: process.env.SANITY_READ_TOKEN, perspective: 'published' } : {}),
})