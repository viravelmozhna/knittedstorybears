import { getCollection, type CollectionEntry } from 'astro:content';

export type Pattern = CollectionEntry<'patterns'>;

export async function getPatterns(): Promise<Pattern[]> {
  const all = await getCollection('patterns', ({ data }) => import.meta.env.DEV || !data.draft);
  return all.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export const DIFFICULTY = {
  beginner: { label: 'Beginner', level: 1 },
  easy: { label: 'Easy', level: 2 },
  intermediate: { label: 'Intermediate', level: 3 },
  advanced: { label: 'Advanced', level: 4 },
} as const;

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
