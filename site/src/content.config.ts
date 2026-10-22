import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    /** Yazı sonundaki çağrı: test ya da fiyatlar */
    cta: z.enum(['test', 'plus']).default('test'),
    draft: z.boolean().default(false),
  }),
})

export const collections = { blog }
