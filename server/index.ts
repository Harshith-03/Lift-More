import 'dotenv/config';
import path from 'node:path';
import { createApp } from './app';
import { loadConfig } from './config';
import { createDb, runMigrations, type Db } from './db';

async function main() {
  const env = process.env;
  const isProduction = env.NODE_ENV === 'production';
  const databaseUrl = env.DATABASE_URL?.trim() || undefined;

  if (isProduction && !databaseUrl && env.ALLOW_PGLITE !== '1') {
    console.error(
      '[boot] DATABASE_URL is required when NODE_ENV=production (set ALLOW_PGLITE=1 to run on an embedded PGlite DB instead).',
    );
    process.exit(1);
  }

  const config = loadConfig(env, {
    staticDir: isProduction ? (env.STATIC_DIR ?? path.resolve(process.cwd(), 'dist/web')) : env.STATIC_DIR,
  });

  const pgliteDir = env.PGLITE_DIR ?? path.resolve(process.cwd(), '.data/pglite');
  const db: Db = await createDb({ databaseUrl, pgliteDir });
  const applied = await runMigrations(db);
  if (applied.length) console.log(`[db] applied migrations: ${applied.join(', ')}`);

  const app = createApp({ db, config });
  const port = Number(env.PORT ?? 3001);
  const server = app.listen(port, () => {
    console.log(
      `[boot] Lift More API on :${port} (${isProduction ? 'production' : 'development'}, db=${db.kind}${
        databaseUrl ? '' : ` @ ${pgliteDir}`
      }, ai=${config.gemini.apiKey ? config.gemini.model : 'off'}${config.staticDir ? `, static=${config.staticDir}` : ''})`,
    );
  });
  // Render's proxy keeps connections alive ~60s; outlive it to avoid 502s on reused sockets.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  let closing = false;
  const shutdown = (signal: string) => {
    if (closing) return;
    closing = true;
    console.log(`[boot] ${signal} received, shutting down`);
    const force = setTimeout(() => {
      console.error('[boot] forced exit after 10s');
      process.exit(1);
    }, 10_000);
    force.unref();
    server.close(async () => {
      await db.close().catch((err) => console.error('[db] close failed:', err));
      process.exit(0);
    });
    server.closeIdleConnections();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[boot] failed to start:', err);
  process.exit(1);
});
