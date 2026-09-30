// Markdown post-processing for pattern posts:
// - runs of photos (consecutive image-only paragraphs) become a grid, like the
//   side-by-side step photos on the old blog
// - every image lazy-loads, with its width and height filled in so the page
//   doesn't jump as photos arrive (which also keeps "Jump to a part" accurate)
import path from 'node:path';
import sharp from 'sharp';

const sizes = new Map();
async function sizeOf(src) {
  if (!src.startsWith('/images/')) return undefined;
  if (!sizes.has(src)) {
    const file = path.join(process.cwd(), 'public', decodeURI(src));
    sizes.set(src, sharp(file).metadata().catch(() => undefined));
  }
  return sizes.get(src);
}

const isBlank = (n) => n.type === 'text' && !n.value.trim();
const isImg = (n) => n.type === 'element' && n.tagName === 'img';
const isBr = (n) => n.type === 'element' && n.tagName === 'br';

function photosOf(node) {
  if (node.type !== 'element' || node.tagName !== 'p') return null;
  const imgs = node.children.filter(isImg);
  const onlyPhotos = imgs.length > 0 && node.children.every((c) => isImg(c) || isBlank(c) || isBr(c));
  return onlyPhotos ? imgs : null;
}

function groupPhotos(parent) {
  const out = [];
  let run = [];
  let pending = [];
  const flush = () => {
    if (run.length === 1) out.push({ type: 'element', tagName: 'p', properties: {}, children: run });
    else if (run.length > 1) {
      out.push({ type: 'element', tagName: 'div', properties: { className: ['photos'] }, children: run });
    }
    run = [];
    out.push(...pending);
    pending = [];
  };
  for (const child of parent.children) {
    const imgs = photosOf(child);
    if (imgs) {
      run.push(...imgs);
      pending = [];
    } else if (run.length && isBlank(child)) {
      pending.push(child);
    } else {
      flush();
      out.push(child);
    }
  }
  flush();
  parent.children = out;
}

function visit(node, fn) {
  fn(node);
  if (node.children) node.children.forEach((c) => visit(c, fn));
}

export default function rehypePhotos() {
  return async (tree) => {
    groupPhotos(tree);
    const imgs = [];
    visit(tree, (n) => {
      if (isImg(n)) imgs.push(n);
    });
    await Promise.all(
      imgs.map(async (n) => {
        n.properties.loading = 'lazy';
        n.properties.decoding = 'async';
        const meta = await sizeOf(String(n.properties.src ?? ''));
        if (meta?.width && meta?.height) {
          n.properties.width = meta.width;
          n.properties.height = meta.height;
        }
      }),
    );
  };
}
