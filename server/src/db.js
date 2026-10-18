import mongoose from 'mongoose';

// If the database is not connected, fail right away instead of waiting.
mongoose.set('bufferCommands', false);

let connecting = null;

// Safe to call many times: it connects once and then does nothing.
export function connectDB(uri) {
  const state = mongoose.connection.readyState; // 0 off, 1 connected, 2 connecting, 3 disconnecting
  if (state === 1) return Promise.resolve();
  if (state === 2 && connecting) return connecting;
  // A small pool, because hosts like Vercel start many copies of the server and Atlas allows a limited number of connections.
  connecting = mongoose
    .connect(uri, { serverSelectionTimeoutMS: 8000, maxPoolSize: 5 })
    .then(() => { console.log('MongoDB connected'); })
    .catch((err) => { connecting = null; throw err; });
  return connecting;
}
