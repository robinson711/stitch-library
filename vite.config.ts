/// <reference types="vitest/config" />
import { pwa } from './src/pwa/vite-plugin';
import { defineConfig, type Plugin } from 'vite';

// Content Security Policy: only this site may supply scripts, styles, images,
// workers and data. GitHub Pages cannot send headers, so it goes in a <meta>
// tag, added to built pages only (the dev server needs inline styles).
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self' blob: data:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function csp(): Plugin {
  return {
    name: 'stitch-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

// ONNX Runtime's bundle points at its own 27 MB .wasm, which Vite would copy
// into assets/. The app loads the copy in public/ort/ instead (set in
// embed.worker.ts), so drop the unused duplicate from the build.
function dropDuplicateOrtWasm(): Plugin {
  return {
    name: 'stitch-drop-ort-wasm',
    apply: 'build',
    generateBundle(_, bundle) {
      for (const name of Object.keys(bundle)) if (/ort-wasm.*\.wasm$/.test(name)) delete bundle[name];
    },
  };
}

export default defineConfig({
  // Relative paths: works under https://<user>.github.io/stitch-library/ and on a local test server.
  base: './',
  plugins: [csp(), dropDuplicateOrtWasm(), pwa()],
  build: {
    target: 'safari18',
    assetsInlineLimit: 0, // never inline files as data: URLs
    rollupOptions: { input: { index: 'index.html', lab: 'lab.html' } },
  },
  worker: { format: 'es', plugins: () => [dropDuplicateOrtWasm()] },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
