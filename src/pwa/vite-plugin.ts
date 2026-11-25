// Adds the Home Screen bits to index.html at build time: manifest, icon,
// colours, and the script that turns on offline support.
import type { Plugin } from 'vite';

export function pwa(): Plugin {
  return {
    name: 'stitch-pwa',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (!ctx.filename.endsWith('index.html')) return html;
        return {
          html,
          tags: [
            { tag: 'link', attrs: { rel: 'manifest', href: './manifest.webmanifest' }, injectTo: 'head' },
            { tag: 'link', attrs: { rel: 'apple-touch-icon', href: './icons/apple-touch-icon.png' }, injectTo: 'head' },
            { tag: 'meta', attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
            { tag: 'meta', attrs: { name: 'mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
            { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: 'Stitches' }, injectTo: 'head' },
            { tag: 'meta', attrs: { name: 'apple-mobile-web-app-status-bar-style', content: 'default' }, injectTo: 'head' },
            { tag: 'meta', attrs: { name: 'theme-color', content: '#fbfaf6', media: '(prefers-color-scheme: light)' }, injectTo: 'head' },
            { tag: 'meta', attrs: { name: 'theme-color', content: '#121410', media: '(prefers-color-scheme: dark)' }, injectTo: 'head' },
            { tag: 'script', attrs: { type: 'module', src: '/src/pwa/register.ts' }, injectTo: 'body' },
          ],
        };
      },
    },
  };
}
