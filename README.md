# Knitted Story Bears

A free crochet pattern blog, built with [Astro](https://astro.build). It's a static site: fast, free to host, and nothing to update or patch.

## Everyday use

```bash
npm install        # once
npm run dev        # preview at http://localhost:4321
npm run build      # build the site into dist/
```

## Where things live

| What | Where |
| --- | --- |
| Site name, tagline, social links, domain | `src/site.config.ts` |
| Patterns (one Markdown file each) | `src/content/patterns/` |
| Pattern photos | `public/images/patterns/<pattern-name>/` |
| About page | `src/pages/about.astro` |
| Stitch guide | `src/pages/stitch-guide.astro` |
| Colours and fonts | `src/styles/global.css` (top of file) |

## Adding a pattern

Create `src/content/patterns/my-new-pattern.md`. The file name becomes the address (`/patterns/my-new-pattern/`).

```markdown
---
title: Sleepy Fox
description: One or two sentences shown on cards and in Google.
date: 2026-10-01
cover: /images/patterns/sleepy-fox/01.jpg
tags: [Amigurumi, Foxes]
difficulty: easy          # beginner | easy | intermediate | advanced
yarn: DK cotton, 50 g
hook: 3 mm
finishedSize: 15 cm
time: 4 hours
materials:
  - Safety eyes
  - Stuffing
draft: true               # hide it until it's ready
---

Intro text…

## Pattern

1. **Rnd 1:** 6 sc in a magic ring [6]
2. **Rnd 2:** inc x 6 [12]
```

Numbered steps, and any line starting with `Rnd`, `Round`, `Row` or `R` plus a number, can be tapped to tick it off.

Each `##` section title (for example `## Head and body`) becomes a button in the "Jump to a part" menu at the start of the pattern. Titles like Abbreviations or Materials are left out.

## Importing from Blogger

The posts, photos and comments from www.knittedstorybears.com are already imported. To import again:

```bash
npm run import:blogger -- http://www.knittedstorybears.com --force
```

`--force` overwrites the pattern files, including any edits you made to them since the last import.

## Comments

Old Blogger comments live in `src/data/comments/` and show under each pattern. New comments use Remark42, which runs on your server. Its address is set in `src/site.config.ts`.

## Going live

See [deploy/README.md](deploy/README.md). In short: point the domain at your server, run `DEPLOY_SERVER=you@your-server npm run deploy`, and add the Caddy config.
