import { createApp } from '../src/app.js';
import { connectDB } from '../src/db.js';
import { mongoStore } from '../src/store.js';

let ready, app;
export default async function handler(req, res) {
  try {
    ready ??= connectDB(process.env.MONGODB_URI);
    await ready;
  } catch (e) {
    ready = undefined;
    return res.status(500).json({ error: 'Database unavailable.' });
  }
  app ??= createApp(mongoStore);
  return app(req, res);
}
