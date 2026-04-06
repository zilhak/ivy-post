import { cpSync, mkdirSync } from 'fs';
import { resolve } from 'path';

const root = resolve(import.meta.dir, '..');
const dist = resolve(root, 'dist');

mkdirSync(dist, { recursive: true });

// Build content script (CSS를 text로 인라인 번들링)
await Bun.build({
  entrypoints: [resolve(root, 'src/content/overlay.ts')],
  outdir: dist,
  naming: 'content.js',
  target: 'browser',
  minify: false,
  loader: { '.css': 'text' },
});

// Build background service worker
await Bun.build({
  entrypoints: [resolve(root, 'src/background/service-worker.ts')],
  outdir: dist,
  naming: 'service-worker.js',
  target: 'browser',
  minify: false,
});

// Build popup
await Bun.build({
  entrypoints: [resolve(root, 'src/popup/popup.ts')],
  outdir: dist,
  naming: 'popup.js',
  target: 'browser',
  minify: false,
});

// Copy static files
cpSync(resolve(root, 'src/manifest.json'), resolve(dist, 'manifest.json'));
cpSync(resolve(root, 'src/popup/popup.html'), resolve(dist, 'popup.html'));
cpSync(resolve(root, 'src/assets'), resolve(dist, 'assets'), { recursive: true });

console.log('Build complete → dist/');
