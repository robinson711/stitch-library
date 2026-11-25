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

// Cross-origin isolation lets the image model use several processor threads.
// The test server sends these headers; on GitHub Pages (no custom headers) the
// service worker will have to add them. Browsers honour them only over HTTPS
// or on localhost.
const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

// Test server only: the speed check page can send its numbers-only report
// here, so nothing has to be copied from the phone. Saved to speed-reports/
// (git-ignored). Not part of the built site.
function speedReportInbox(): Plugin {
  return {
    name: 'stitch-speed-report-inbox',
    configurePreviewServer(server) {
      server.middlewares.use('/__speed-report', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        let tooBig = false;
        req.setEncoding('utf8');
        req.on('data', (chunk: string) => {
          body += chunk;
          if (body.length > 20_000) { tooBig = true; req.destroy(); }
        });
        req.on('end', async () => {
          if (tooBig) return;
          const { mkdir, writeFile } = await import('node:fs/promises');
          await mkdir('speed-reports', { recursive: true });
          const name = `speed-reports/speed-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
          await writeFile(name, body.replace(/[^\x09\x0a\x20-\x7e\u00a0-\u024f\u2013\u00b7]/g, ''));
          console.log(`\nSpeed report saved: ${name}\n${body}\n`);
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

export default defineConfig({
  // Relative paths: works under https://<user>.github.io/stitch-library/ and on a local test server.
  base: './',
  plugins: [csp(), dropDuplicateOrtWasm(), speedReportInbox(), pwa()],
  server: { headers: ISOLATION_HEADERS },
  preview: { headers: ISOLATION_HEADERS },
  build: {
    target: 'safari18',
    assetsInlineLimit: 0, // never inline files as data: URLs
    rollupOptions: { input: { index: 'index.html', lab: 'lab.html', speed: 'speed.html' } },
  },
  worker: { format: 'es', plugins: () => [dropDuplicateOrtWasm()] },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
