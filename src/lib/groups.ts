import type { Pattern } from './patterns';

// The groups patterns are browsed by. `patterns` lists pattern file names
// (without .md); a pattern can be in more than one group. `cover` picks
// which pattern's photo represents the group.
export const GROUPS = [
  {
    slug: 'chinese-horoscope',
    name: 'Chinese horoscope',
    description: 'Little animals from the Chinese zodiac — collect the whole set.',
    cover: 'amigurumi-crochet-dragon',
    patterns: [
      'amigurumi-crochet-dragon',
      'amigurumi-crochet-bull',
      'little-crochet-mouse',
      'little-crochet-pigs',
      'little-crochet-bunny',
    ],
  },
  {
    slug: 'christmas-ornaments',
    name: 'Christmas ornaments',
    description: 'Flat little ornaments to hang on your Christmas tree.',
    cover: 'christmas-tree-ornament-crochet-car',
    patterns: [
      'christmas-tree-ornament-crochet-car',
      'christmas-tree-ornament-crochet-gnome',
      'christmas-tree-ornaments-crochet-house',
    ],
  },
  {
    slug: 'valentines-and-spring',
    name: "Valentine's & spring",
    description: 'A puffy heart for Valentine’s Day, Easter bunnies, a lucky gnome and a crunchy radish.',
    cover: 'easter-crochet-bunny-rabbit',
    patterns: [
      'crochet-heart',
      'easter-crochet-bunny-rabbit',
      'little-crochet-bunny',
      'st-patricks-gnome',
      'amigurumi-radish',
    ],
  },
  {
    slug: 'autumn',
    name: 'Autumn',
    description: 'Pumpkins and cosy makes for autumn and Halloween.',
    cover: 'amigurumi-pumpkin',
    patterns: ['amigurumi-pumpkin', 'flowers-crochet-pot'],
  },
  {
    slug: 'little-friends',
    name: 'Little friends',
    description: 'Cuddly amigurumi friends: bears, a moose, a llama, an elf doll and more.',
    cover: 'moose-crochet-amigurumi',
    patterns: [
      'crochet-teddy-bear',
      'amigurumi-doll',
      'moose-crochet-amigurumi',
      'crochet-llama-alpaca',
      'little-crochet-pigs',
      'little-crochet-mouse',
      'little-crochet-bunny',
      'amigurumi-crochet-bull',
      'amigurumi-crochet-dragon',
      'the-needle-felted-details-for-a-crochet-teddy-bear-video-tutorial',
    ],
  },
] as const;

export type Group = (typeof GROUPS)[number];

export function groupsOf(pattern: Pattern): Group[] {
  return GROUPS.filter((g) => (g.patterns as readonly string[]).includes(pattern.id));
}

export function patternsIn(group: Group, patterns: Pattern[]): Pattern[] {
  return patterns.filter((p) => (group.patterns as readonly string[]).includes(p.id));
}
