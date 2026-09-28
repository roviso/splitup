import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import { csrf } from 'hono/csrf';
import { logger } from 'hono/logger';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runMigrations } from './db';
import { authRoutes, meRoutes, requireUser, type Env } from './auth';
import { routes, publicRoutes } from './routes';

const api = new Hono<Env>()
  .use(bodyLimit({ maxSize: 1024 * 1024 }))
  .route('/', authRoutes)
  .route('/', publicRoutes)
  .use(requireUser)
  .route('/', meRoutes)
  .route('/', routes);

const app = new Hono()
  .use(logger(), secureHeaders({ crossOriginOpenerPolicy: 'same-origin-allow-popups' }), csrf())
  .route('/api', api)
  .all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: 'Something went wrong' }, 500);
});

// Built web app (production). In dev, Vite serves it and proxies /api here.
const web = process.env.WEB_DIST ?? '../web/dist';
if (existsSync(join(web, 'index.html'))) {
  const index = readFileSync(join(web, 'index.html'), 'utf8');
  app.use('/assets/*', serveStatic({ root: web, onFound: (_p, c) => c.header('Cache-Control', 'public, max-age=31536000, immutable') }));
  app.use('*', serveStatic({ root: web }));
  app.get('*', (c) => c.html(index)); // SPA fallback
}

const port = Number(process.env.PORT ?? 3000);
runMigrations(process.env.MIGRATIONS_DIR ?? 'drizzle').then(() =>
  serve({ fetch: app.fetch, port }, () => console.log(`Split-Up API on http://localhost:${port}`)),
);
