import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import authRoutes from './routes/auth.js';
import siteRoutes from './routes/site.js';
import usersRoutes from './routes/users.js';
import superRoutes from './routes/super.js';
import { HttpError, SetupError } from './lib/errors.js';
import { mergeLimits } from './lib/limiter.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: 'One picture is bigger than 5 MB.',
  LIMIT_FILE_COUNT: 'You can add up to 20 pictures at a time.',
};

// "store" is where the data lives (see store.js). The tests pass in a store that keeps everything in memory.
// "options" is only used by the tests, to change the limits.
export function createApp(store, options = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // hosts like Render and Vercel put a proxy in front, so rate limits need the real visitor address

  const settings = {
    limits: mergeLimits(options.limits),
    auth: { maxFailures: 5, lockMinutes: 10, tokenDays: 7, ...options.auth },
  };

  // Small safety headers on every answer.
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff', // the browser must trust the file type we say
      'X-Frame-Options': 'SAMEORIGIN', // nobody can show this site inside another site's frame
      'Referrer-Policy': 'same-origin',
      'X-Robots-Tag': 'noindex, nofollow', // these are personal pages, search engines should not list them
    });
    next();
  });

  const origins = (process.env.CLIENT_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (origins.length) app.use(cors({ origin: origins }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // The first request connects to the database and runs the start-up steps. If that fails, say why in plain words.
  if (typeof store.ready === 'function') {
    app.use('/api', (req, res, next) => {
      store.ready().then(() => next(), (err) => {
        if (!(err instanceof SetupError)) console.error(err);
        res.status(503).json({ error: err instanceof SetupError ? err.message : 'The server is not ready yet. Please try again in a moment.' });
      });
    });
  }

  app.use('/api/auth', authRoutes(store, settings));
  app.use('/api/users', usersRoutes(store, settings));
  app.use('/api/super', superRoutes(store, settings));
  app.use('/api', siteRoutes(store, settings));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // After "npm run build" this same server also serves the React site.
  const dist = path.resolve(here, '../../client/dist');
  if (fs.existsSync(dist)) {
    app.use('/assets', express.static(path.join(dist, 'assets'), { maxAge: '1y', immutable: true })); // file names change when the code changes
    app.use(express.static(dist));
    app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // One place for all errors.
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.name === 'MulterError') return res.status(400).json({ error: MULTER_MESSAGES[err.code] || 'That upload could not be read.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That request is too big.' });
    if (err.status && err.status < 500) return res.status(err.status).json({ error: 'That request could not be read.' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });
  return app;
}
