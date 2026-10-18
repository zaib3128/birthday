import 'dotenv/config';
import { createApp } from './app.js';
import { mongoStore } from './store.js';

const app = createApp(mongoStore);
export default app; // hosts that run the server as a "function" (like Vercel) use this

// On your own computer (or a host that keeps the server running) we start listening ourselves.
if (!process.env.VERCEL) {
  try {
    await mongoStore.ready(); // checks the settings, connects to MongoDB, and sets up the super admin
  } catch (err) {
    console.error(`\n${err.message}`);
    console.error('Check server/.env (copy .env.example to .env if you have not yet), and that MongoDB is running (for Atlas: that your IP address is allowed).\n');
    process.exit(1);
  }
  const port = process.env.PORT || 5000;
  app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
}
