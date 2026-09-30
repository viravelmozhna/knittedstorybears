#!/usr/bin/env node
// Imports posts from a Blogger blog into src/content/patterns/.
//
//   npm run import:blogger -- https://yourblog.blogspot.com
//   npm run import:blogger -- ./blog-backup.xml
//
// Options:
//   --no-images   keep images hot-linked to Blogger instead of downloading them
//   --force       overwrite posts that were already imported
//
// Published posts become Markdown files, their photos are downloaded, Blogger
// comments are saved to src/data/comments/ (link spam is dropped), Blogger pages
// go to imported-pages/ for reference, and redirects from the old addresses are
// written to deploy/ for Caddy.

import fs from 'node:fs/promises';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import TurndownService from 'turndown';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const POSTS_DIR = path.join(ROOT, 'src/content/patterns');
const IMAGES_DIR = path.join(ROOT, 'public/images/patterns');
const PAGES_DIR = path.join(ROOT, 'imported-pages');
const COMMENTS_DIR = path.join(ROOT, 'src/data/comments');
const DEPLOY_DIR = path.join(ROOT, 'deploy');

const args = process.argv.slice(2);
const source = args.find((a) => !a.startsWith('--'));
const downloadImages = !args.includes('--no-images');
const force = args.includes('--force');

if (!source) {
  console.error('Usage: npm run import:blogger -- <blog URL or backup .xml> [--no-images] [--force]');
  process.exit(1);
}

// ---------------------------------------------------------------- reading

const text = (v) => (v == null ? '' : typeof v === 'string' ? v : String(v['#text'] ?? ''));
const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

// Reads every entry of a Blogger JSON feed, following pagination.
async function readFeed(base, feedPath) {
  const entries = [];
  const pageSize = 150;
  let author;
  for (let start = 1; ; start += pageSize) {
    const res = await fetch(`${base}${feedPath}?alt=json&max-results=${pageSize}&start-index=${start}`);
    if (!res.ok) {
      if (feedPath.includes('/posts/')) throw new Error(`Couldn't read the blog feed (${res.status}). Is the blog public?`);
      return { entries, author };
    }
    const feed = (await res.json()).feed;
    author ??= feed.author?.[0]?.name?.$t;
    const page = feed.entry ?? [];
    entries.push(...page);
    if (page.length < pageSize) return { entries, author };
  }
}

async function fromFeed(url) {
  const base = url.replace(/\/+$/, '');
  const alternate = (e) => arr(e.link).find((l) => l.rel === 'alternate')?.href;
  const toItem = (e) => ({
    id: e.id?.$t,
    title: e.title?.$t ?? '',
    html: e.content?.$t ?? e.summary?.$t ?? '',
    published: e.published?.$t,
    updated: e.updated?.$t,
    labels: arr(e.category).map((c) => c.term),
    url: alternate(e),
  });

  const { entries, author } = await readFeed(base, '/feeds/posts/default');
  const posts = entries.map(toItem);
  const pages = (await readFeed(base, '/feeds/pages/default')).entries.map(toItem);
  const comments = (await readFeed(base, '/feeds/comments/default')).entries.map((e) => ({
    id: e.id?.$t?.split('post-').pop(),
    postUrl: e['thr$in-reply-to']?.href,
    parent: arr(e.link).find((l) => l.rel === 'related')?.href?.split('/').pop(),
    author: e.author?.[0]?.name?.$t ?? 'Anonymous',
    date: e.published?.$t,
    html: e.content?.$t ?? '',
  }));
  console.log(`Read ${posts.length} posts, ${pages.length} pages and ${comments.length} comments from the blog.`);
  return { posts, pages, comments, author };
}

async function fromBackup(file) {
  const xml = await fs.readFile(file, 'utf8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    isArray: (name) => ['entry', 'category', 'link'].includes(name),
  });
  const feed = parser.parse(xml).feed;
  if (!feed) throw new Error("That file doesn't look like a Blogger backup.");

  const posts = [];
  const pages = [];
  const comments = [];
  const KIND = 'http://schemas.google.com/g/2005#kind';

  for (const e of arr(feed.entry)) {
    const cats = arr(e.category);
    // Newer exports use <blogger:type>/<blogger:status>, older ones use kind categories.
    let type = text(e['blogger:type']).toUpperCase();
    if (!type) {
      const kind = cats.find((c) => c['@_scheme'] === KIND)?.['@_term'] ?? '';
      type = kind.split('#').pop()?.toUpperCase() ?? '';
    }
    const status = text(e['blogger:status']).toUpperCase();
    const isDraft =
      (status && status !== 'LIVE') || text(e['app:control']?.['app:draft']).toLowerCase() === 'yes';

    if (type === 'COMMENT') {
      const reply = e['thr:in-reply-to'];
      comments.push({
        id: text(e.id).split('post-').pop(),
        postUrl: reply?.['@_href'],
        parent: arr(e.link).find((l) => l['@_rel'] === 'related')?.['@_href']?.split('/').pop(),
        author: text(e.author?.name) || 'Anonymous',
        date: text(e.published),
        html: text(e.content),
      });
      continue;
    }
    if ((type !== 'POST' && type !== 'PAGE') || isDraft) continue;

    const alt = arr(e.link).find((l) => l['@_rel'] === 'alternate')?.['@_href'];
    const filename = text(e['blogger:filename']);
    const item = {
      title: text(e.title),
      html: text(e.content),
      published: text(e.published),
      updated: text(e.updated),
      labels: cats.filter((c) => c['@_scheme'] !== KIND).map((c) => c['@_term']).filter(Boolean),
      url: alt || filename || undefined,
    };
    (type === 'PAGE' ? pages : posts).push(item);
  }
  const author = text(arr(feed.author)[0]?.name) || undefined;
  return { posts, pages, comments, author };
}

// ---------------------------------------------------------------- converting

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  hr: '---',
});
turndown.keep(['iframe', 'table']);
turndown.remove(['script', 'style', 'noscript']);

// In-page anchors (<a name="Arms">) that "Go to" links jump to.
turndown.addRule('anchor', {
  filter: (node) =>
    node.nodeName === 'A' && !node.getAttribute('href') && (node.getAttribute('name') || node.getAttribute('id')),
  replacement: (content, node) => `<a id="${node.getAttribute('name') || node.getAttribute('id')}"></a>${content}`,
});

const isImageUrl = (href = '') =>
  /\.(jpe?g|png|gif|webp)(\?|$)/i.test(href) || /(googleusercontent\.com|bp\.blogspot\.com)/i.test(href);

// Blogger wraps each photo in a link to the full-size version — keep just the big image.
turndown.addRule('bloggerImageLink', {
  filter: (node) =>
    node.nodeName === 'A' &&
    isImageUrl(node.getAttribute('href')) &&
    node.children.length === 1 &&
    node.firstElementChild.nodeName === 'IMG' &&
    node.textContent.trim() === '',
  replacement: (_content, node) => {
    const img = node.firstElementChild;
    return `\n\n![${(img.getAttribute('alt') || '').replace(/[\[\]]/g, '')}](${node.getAttribute('href')})\n\n`;
  },
});
turndown.addRule('blockImage', {
  filter: 'img',
  replacement: (_c, node) => {
    const src = node.getAttribute('src');
    return src ? `\n\n![${(node.getAttribute('alt') || '').replace(/[\[\]]/g, '')}](${src})\n\n` : '';
  },
});

function htmlToMarkdown(html) {
  const cleaned = html
    .replace(/<a\s+name=["']more["'][^>]*>\s*<\/a>/gi, '')
    // Keep id targets (e.g. <h2 id="Arms">) as anchors so "Go to" links still work.
    .replace(
      /<(h[1-6]|p|div|span|b|strong|em|i|li|td)\b([^>]*?)\sid=["']([^"']+)["']([^>]*)>/gi,
      (_m, tag, before, id, after) => `<${tag}${before}${after}><a name="${id}"></a>`,
    )
    .replace(/&nbsp;/g, ' ');
  return turndown
    .turndown(cleaned)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, (m) => (m.startsWith('  ') ? '  \n' : '\n'))
    // Rounds written as "Rnd 1…<br>Rnd 2…" become separate paragraphs, so each can be ticked off.
    .replace(/ {2}\n(?=[ \t]*(?:\*\*)?(?:rnds?|rounds?|rows?|r)\s*\d)/gi, '\n\n')
    .replace(/^[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function slugify(s) {
  return (
    s
      .replace(/['’]/g, '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 80) || 'post'
  );
}

function pathOf(url) {
  if (!url) return undefined;
  try {
    return new URL(url, 'https://x.invalid').pathname;
  } catch {
    return undefined;
  }
}

// "Amigurumi crochet DRAGON free pattern" → "amigurumi-crochet-dragon"
function titleSlug(title) {
  return slugify(title.replace(/\b(free|easy|(crochet\s+)?pattern)\b/gi, ' '));
}

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Comments keep only simple formatting; everything else becomes plain text.
function sanitiseComment(html) {
  return html
    .replace(/<br\s*\/?>/gi, '<br>')
    .replace(/<(\/?)(b|i|em|strong)\b[^>]*>/gi, '<$1$2>')
    .replace(/<(?!\/?(?:b|i|em|strong|br)>)[^>]*>/gi, '')
    .trim();
}

function plainText(md) {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`\\|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function excerpt(md, max = 170) {
  // Prefer the intro (text before the first heading) over pattern instructions.
  const intro = plainText(md.split(/^#{1,6} /m)[0]);
  const t = (intro.length >= 40 ? intro : plainText(md)).replace(/\s+([.,!?;:])/g, '$1');
  if (t.length <= max) return t;
  return t.slice(0, t.lastIndexOf(' ', max)).replace(/[,;:.]$/, '') + '…';
}

function guessHook(md) {
  const t = plainText(md);
  const m =
    t.match(/(\d+(?:[.,]\d+)?\s?mm)\s*(?:\([^)]{0,12}\)\s*)?(?:crochet\s+)?hook/i) ||
    t.match(/hook[^.]{0,25}?(\d+(?:[.,]\d+)?\s?mm)/i);
  return m?.[1]?.replace(',', '.').replace(/\s+/, ' ');
}

// Ask Blogger for a large version of the image rather than the thumbnail.
function fullSize(url) {
  if (!/(googleusercontent\.com|blogspot\.com)/i.test(url)) return url;
  return url
    .replace(/\/(?:s|w|h)\d+(?:-[a-z0-9-]+)?(?=\/[^/]+$)/i, '/s1600')
    .replace(/=(?:s|w|h)\d+[^/?#]*$/i, '=s1600');
}

const MAX_IMAGE_WIDTH = 1200;
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };

async function download(url, destBase) {
  for (const candidate of [...new Set([fullSize(url), url])]) {
    try {
      const res = await fetch(candidate, {
        headers: { 'User-Agent': 'Mozilla/5.0 (blog importer)' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) continue;
      const type = (res.headers.get('content-type') || '').split(';')[0];
      const ext = EXT[type] || path.extname(new URL(candidate).pathname).toLowerCase() || '.jpg';
      const buf = Buffer.from(await res.arrayBuffer());
      if (ext === '.gif') {
        await fs.writeFile(destBase + ext, buf);
        return path.basename(destBase + ext);
      }
      // Shrink to a sensible web size; Blogger originals are often several MB.
      await sharp(buf)
        .rotate()
        .resize({ width: MAX_IMAGE_WIDTH, height: MAX_IMAGE_WIDTH, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80, mozjpeg: true })
        .toFile(destBase + '.jpg');
      return path.basename(destBase + '.jpg');
    } catch {}
  }
  return undefined;
}

async function localiseImages(md, slug) {
  const urls = new Set();
  for (const m of md.matchAll(/!\[[^\]]*\]\((\S+?)\)/g)) urls.add(m[1]);
  for (const m of md.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) urls.add(m[1]);
  const remote = [...urls].filter((u) => /^(https?:)?\/\//.test(u));
  if (!downloadImages || remote.length === 0) return { md, images: remote.map(fullSize), failed: 0 };

  const dir = path.join(IMAGES_DIR, slug);
  await fs.mkdir(dir, { recursive: true });
  const map = new Map();
  let failed = 0;
  let n = 0;
  const queue = [...remote];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (queue.length) {
        const url = queue.shift();
        const i = ++n;
        const abs = url.startsWith('//') ? `https:${url}` : url;
        const file = await download(abs, path.join(dir, String(i).padStart(2, '0')));
        if (file) map.set(url, `/images/patterns/${slug}/${file}`);
        else failed++;
      }
    }),
  );
  let out = md;
  for (const [from, to] of map) out = out.split(from).join(to);
  const images = remote.map((u) => map.get(u) ?? fullSize(u));
  return { md: out, images, failed };
}

// ---------------------------------------------------------------- writing

const q = (s) => JSON.stringify(s);

function frontmatter(p) {
  const lines = [
    '---',
    `title: ${q(p.title)}`,
    `description: ${q(p.description)}`,
    `date: ${p.date}`,
  ];
  if (p.updated && p.updated !== p.date) lines.push(`updated: ${p.updated}`);
  if (p.cover) lines.push(`cover: ${q(p.cover)}`, `coverAlt: ${q(p.title)}`);
  lines.push(`tags: ${q(p.tags)}`);
  lines.push('# Pattern details — fill these in to show the "At a glance" box:');
  lines.push('difficulty: easy   # please check: beginner | easy | intermediate | advanced');
  lines.push('# yarn: ""');
  lines.push(p.hook ? `hook: ${q(p.hook)}   # guessed from the post — please check` : '# hook: ""');
  lines.push('# finishedSize: ""');
  lines.push('# time: ""');
  lines.push('# materials: ["…", "…"]');
  if (p.bloggerUrl) lines.push(`bloggerUrl: ${q(p.bloggerUrl)}`);
  lines.push('---');
  return lines.join('\n');
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function removeSamples() {
  let removed = 0;
  for (const f of await fs.readdir(POSTS_DIR)) {
    const file = path.join(POSTS_DIR, f);
    if (f.endsWith('.md') && /^sample:\s*true\s*$/m.test(await fs.readFile(file, 'utf8'))) {
      await fs.rm(file);
      removed++;
    }
  }
  await fs.rm(path.join(ROOT, 'public/images/samples'), { recursive: true, force: true });
  return removed;
}

// Old path → new path, kept across imports in deploy/redirects.txt and
// written out for Caddy.
// Caddy snippet, imported inside the site block of deploy/Caddyfile.
function caddyRedirects(entries) {
  const quote = (p) => JSON.stringify(decodeURIComponent(p));
  return `# Generated by the Blogger import: old Blogger addresses → new pages.\n${entries
    .map(([from, to]) => `redir ${quote(from)} ${to} permanent`)
    .join('\n')}\n`;
}

async function writeRedirects(rules) {
  await fs.mkdir(DEPLOY_DIR, { recursive: true });
  const listFile = path.join(DEPLOY_DIR, 'redirects.txt');
  const previous = (await exists(listFile)) ? (await fs.readFile(listFile, 'utf8')).split('\n') : [];
  const byPath = new Map();
  for (const line of [...previous, ...rules]) {
    const [from, to] = line.trim().split(/\s+/);
    if (from && to && !from.startsWith('#')) byPath.set(from, to);
  }
  const entries = [...byPath.entries()];
  await fs.writeFile(
    listFile,
    `# Old Blogger address → new address (source for the files below; kept between imports)\n${entries
      .map(([a, b]) => `${a} ${b}`)
      .join('\n')}\n`,
  );
  await fs.writeFile(path.join(DEPLOY_DIR, 'caddy-redirects.caddy'), caddyRedirects(entries));
  return entries.length;
}

async function writeComments(comments, slugByPath, author) {
  const byPost = new Map();
  let spam = 0;
  let saved = 0;
  for (const c of comments) {
    const slug = slugByPath.get(pathOf(c.postUrl));
    if (!slug) continue;
    const isAuthor = !!author && c.author === author;
    // Blogger comment spam is almost always a link; real readers rarely post one.
    if (!isAuthor && /<a\s/i.test(c.html)) {
      spam++;
      continue;
    }
    const html = sanitiseComment(c.html);
    if (!html) continue;
    const list = byPost.get(slug) ?? [];
    list.push({ id: c.id, parent: c.parent, author: c.author, isAuthor, date: c.date, html });
    byPost.set(slug, list);
  }
  // Only replace saved comments when this import actually brought some.
  if (comments.length) await fs.rm(COMMENTS_DIR, { recursive: true, force: true });
  if (byPost.size) await fs.mkdir(COMMENTS_DIR, { recursive: true });
  for (const [slug, list] of byPost) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    saved += list.length;
    await fs.writeFile(path.join(COMMENTS_DIR, `${slug}.json`), JSON.stringify(list, null, 2) + '\n');
  }
  return { saved, spam };
}

async function main() {
  const isUrl = !source.toLowerCase().endsWith('.xml');
  const { posts, pages, comments, author } = isUrl
    ? await fromFeed(/^https?:/i.test(source) ? source : `https://${source}`)
    : await fromBackup(path.resolve(source));

  if (posts.length === 0) {
    console.log('No published posts found — nothing imported.');
    return;
  }

  await fs.mkdir(POSTS_DIR, { recursive: true });
  const removed = await removeSamples();

  const usedSlugs = new Set();
  const redirects = [];
  const labels = new Set();
  const slugByPath = new Map();
  let written = 0;
  let skipped = 0;
  let failedImages = 0;

  for (const [i, post] of posts.entries()) {
    const oldPath = pathOf(post.url);
    const fromUrl = oldPath?.match(/\/([^/]+?)(?:\.html?)?$/)?.[1];
    let slug = post.title ? titleSlug(post.title) : slugify(fromUrl || `post-${i + 1}`);
    while (usedSlugs.has(slug)) slug += '-2';
    usedSlugs.add(slug);
    post.slug = slug;
    if (oldPath) slugByPath.set(oldPath, slug);
    post.labels.forEach((l) => labels.add(l));
  }
  const blogHosts = new Set(posts.map((p) => p.url && new URL(p.url, 'https://x.invalid').hostname.replace(/^www\./, '')));

  // Links to other posts on the old blog → their new addresses. A link whose
  // text is just the old address gets the post title or label instead.
  const titleBySlug = new Map(posts.map((p) => [p.slug, p.title]));
  const newAddress = (href) => {
    let u;
    try {
      u = new URL(href);
    } catch {
      return undefined;
    }
    if (!blogHosts.has(u.hostname.replace(/^www\./, ''))) return undefined;
    const slug = slugByPath.get(u.pathname);
    if (slug) return { href: `/patterns/${slug}/${u.hash}`, name: titleBySlug.get(slug) };
    const label = u.pathname.match(/^\/search\/label\/(.+)$/)?.[1];
    if (label) {
      const name = decodeURIComponent(label);
      return { href: '/patterns/', name: `${capitalise(name)} patterns` };
    }
    if (u.pathname === '/' || u.pathname === '') return { href: '/', name: 'all free patterns' };
    return undefined;
  };
  const rewriteLinks = (md) =>
    md
      .replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (whole, label, href) => {
        const to = newAddress(href);
        if (!to) return whole;
        const text = /^\s*(https?:\/\/|www\.|knittedstorybears\.com)/i.test(label) ? to.name ?? label : label;
        return `[${text}](${to.href})`;
      })
      // Blogger leaves empty links behind next to images and line breaks.
      .replace(/(?<!!)\[\s*\]\([^)]*\)/g, '');

  for (const [i, post] of posts.entries()) {
    const oldPath = pathOf(post.url);
    const slug = post.slug;

    const file = path.join(POSTS_DIR, `${slug}.md`);
    if (oldPath) redirects.push(`${oldPath} /patterns/${slug}/ 301`);

    if (!force && (await exists(file))) {
      skipped++;
      continue;
    }

    process.stdout.write(`\r[${i + 1}/${posts.length}] ${post.title.slice(0, 60).padEnd(60)}`);
    let md = rewriteLinks(htmlToMarkdown(post.html));
    const { md: localMd, images, failed } = await localiseImages(md, slug);
    // The cover is shown beside the text, so drop it when it opens the post.
    md = localMd.replace(/^!\[[^\]]*\]\((\S+?)\)\s*/, (m, src) => (src === images[0] ? '' : m));
    failedImages += failed;

    const date = (post.published || new Date().toISOString()).slice(0, 10);
    const updated = post.updated?.slice(0, 10);
    const fm = frontmatter({
      title: post.title || 'Untitled',
      description: excerpt(md),
      date,
      updated,
      cover: images[0],
      tags: post.labels.map(capitalise),
      hook: guessHook(md),
      bloggerUrl: post.url,
    });
    await fs.writeFile(file, `${fm}\n\n${md}\n`);
    written++;
  }
  console.log('');

  for (const page of pages) {
    await fs.mkdir(PAGES_DIR, { recursive: true });
    const slug = slugify(page.title);
    await fs.writeFile(
      path.join(PAGES_DIR, `${slug}.md`),
      `# ${page.title}\n\n<!-- from ${page.url ?? 'Blogger'} -->\n\n${htmlToMarkdown(page.html)}\n`,
    );
    const p = pathOf(page.url);
    if (p) redirects.push(`${p} / 301`);
  }

  for (const label of labels) {
    redirects.push(`/search/label/${encodeURIComponent(label)} /patterns/ 301`);
  }
  const redirectCount = await writeRedirects(redirects);

  const { saved: savedComments, spam } = await writeComments(comments, slugByPath, author);

  console.log(`\n✔ Imported ${written} posts${skipped ? `, skipped ${skipped} already imported (use --force to overwrite)` : ''}.`);
  if (removed) console.log(`✔ Removed ${removed} example posts.`);
  if (pages.length) console.log(`✔ Saved ${pages.length} Blogger pages to imported-pages/ (not published).`);
  console.log(`✔ Wrote ${redirectCount} redirects to deploy/redirects.txt and deploy/caddy-redirects.caddy.`);
  if (savedComments) console.log(`✔ Saved ${savedComments} Blogger comments to src/data/comments/${spam ? ` (dropped ${spam} link-spam)` : ''}.`);
  if (failedImages) console.log(`⚠ ${failedImages} images couldn't be downloaded and still point to Blogger.`);
}

main().catch((err) => {
  console.error(`\n✖ ${err.message}`);
  process.exit(1);
});
