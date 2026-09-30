// Adds a "Jump to a part" menu to every pattern.
// Posts that already have a "Go to the:" link list keep its hand-picked parts:
// the first list becomes the menu, the copies after each section become a small
// "↑ All parts" link. Other posts get a menu built from their section titles.
const isBlank = (n) => n.type === 'text' && !n.value.replace(/[|\s]/g, '');
const textOf = (n) => (n.type === 'text' ? n.value : (n.children ?? []).map(textOf).join(''));

function partLinks(node) {
  if (node?.type !== 'element' || node.tagName !== 'p') return null;
  const links = node.children.filter((c) => c.type === 'element' && c.tagName === 'a');
  const onlyLinks = node.children.every(
    (c) => isBlank(c) || (c.type === 'element' && (c.tagName === 'br' || c.tagName === 'a')),
  );
  const allAnchors = links.every((a) => String(a.properties?.href ?? '').startsWith('#'));
  return links.length > 1 && onlyLinks && allAnchors ? links : null;
}

const el = (tagName, properties, children = []) => ({ type: 'element', tagName, properties, children });
const text = (value) => ({ type: 'text', value });

// Section titles that aren't parts of the toy.
const NOT_A_PART = /abbreviation|terms|stitches|materials|supplies|size|difficulty|yarn|pin it|my links|you might also like|ready/i;

const slug = (t) =>
  t
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

function menu(items) {
  return el('nav', { className: ['parts'], id: 'parts', ariaLabel: 'Parts of this pattern' }, [
    el('p', { className: ['parts-label'] }, [text('Jump to a part')]),
    el(
      'ul',
      {},
      items.map(({ href, label }) => el('li', {}, [el('a', { href }, [text(label)])])),
    ),
  ]);
}

// Builds the menu from the post's "##" section titles.
function menuFromHeadings(tree) {
  const parts = tree.children.filter(
    (n) => n.type === 'element' && n.tagName === 'h2' && !NOT_A_PART.test(textOf(n)),
  );
  if (parts.length < 2) return;
  for (const h of parts) h.properties.id ||= slug(textOf(h));
  const items = parts.map((h) => ({ href: `#${h.properties.id}`, label: textOf(h).replace(/\s+/g, ' ').trim() }));
  tree.children.splice(tree.children.indexOf(parts[0]), 0, menu(items));
}

export default function rehypeParts() {
  return (tree) => {
    const out = [];
    let seen = false;
    const kids = tree.children;
    for (let i = 0; i < kids.length; i++) {
      const node = kids[i];
      const isHeading = node.type === 'element' && /^h[1-6]$/.test(node.tagName);
      if (!isHeading || !/^\s*go to( the)?:?\s*$/i.test(textOf(node))) {
        out.push(node);
        continue;
      }
      let j = i + 1;
      while (j < kids.length && isBlank(kids[j])) j++;
      const links = partLinks(kids[j]);
      if (!links) {
        out.push(node);
        continue;
      }
      if (!seen) {
        seen = true;
        out.push(
          menu(links.map((a) => ({ href: a.properties.href, label: textOf(a).replace(/\s+/g, ' ').trim() }))),
        );
      } else {
        out.push(el('p', { className: ['parts-back'] }, [el('a', { href: '#parts' }, [text('↑ All parts')])]));
      }
      i = j;
    }
    tree.children = out;
    if (!seen) menuFromHeadings(tree);
  };
}
