import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const patterns = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/patterns' }),
  schema: z.object({
    // Short name shown on the page and cards.
    title: z.string(),
    // Full title for search engines and the browser tab.
    searchTitle: z.string().optional(),
    description: z.string().default(''),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    cover: z.string().optional(),
    coverAlt: z.string().optional(),
    // Tall picture made for Pinterest; the "Pin it" button shares it instead of the cover.
    pinImage: z.string().optional(),
    tags: z.array(z.string()).default([]),
    // Every pattern shows its skill level on its card and page.
    difficulty: z.enum(['beginner', 'easy', 'intermediate', 'advanced']),
    // Other pattern details are optional; the details card only shows what's filled in.
    yarn: z.string().optional(),
    // Brands and colour numbers, shown in small print under the yarn.
    yarnNote: z.string().optional(),
    hook: z.string().optional(),
    finishedSize: z.string().optional(),
    time: z.string().optional(),
    materials: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    // Marks the example posts; the Blogger import removes them.
    sample: z.boolean().default(false),
    // Original Blogger address, used to build redirects.
    bloggerUrl: z.string().optional(),
  }),
});

export const collections = { patterns };
