import fs from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';

/** Never cached: the SW/manifest/shell must update as soon as a deploy lands. */
const NO_CACHE_FILES = new Set(['index.html', 'sw.js', 'registerSW.js', 'manifest.webmanifest']);

/**
 * Serves the built SPA: hashed `/assets/*` immutable for a year, shell files no-cache,
 * and an index.html fallback for client-side routes (never for `/api/*`).
 */
export function mountStatic(app: Express, staticDir: string): void {
  const root = path.resolve(staticDir);
  const indexHtml = path.join(root, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    console.warn(`[static] ${indexHtml} not found — SPA routes will 404 until the web app is built`);
  }

  app.use(
    express.static(root, {
      index: false,
      redirect: false,
      setHeaders(res, filePath) {
        const rel = path.relative(root, filePath).split(path.sep).join('/');
        if (rel.startsWith('assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (NO_CACHE_FILES.has(rel) || rel.startsWith('workbox-')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }),
  );

  app.get('/{*splat}', (req, res, next) => {
    if (req.path === '/api' || req.path.startsWith('/api/')) return next();
    // A missing hashed asset is a stale client, not a route: 404 rather than HTML-as-JS.
    if (req.path.startsWith('/assets/')) return res.status(404).type('text/plain').send('Not found');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml, (err) => {
      if (err && !res.headersSent) res.status(404).type('text/plain').send('Not found');
    });
  });
}
