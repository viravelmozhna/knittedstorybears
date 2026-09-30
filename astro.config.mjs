import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import rehypePhotos from './src/lib/rehype-photos.mjs';
import rehypeParts from './src/lib/rehype-parts.mjs';
import { SITE } from './src/site.config.ts';

export default defineConfig({
  site: SITE.url,
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  markdown: {
    rehypePlugins: [rehypePhotos, rehypeParts],
  },
});
