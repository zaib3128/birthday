import mongoose from 'mongoose';

// One document per person who can log in to /admin.
const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false }, // never the password itself, and never sent to the website
    role: { type: String, enum: ['admin', 'superadmin'], default: 'admin' },
    status: { type: String, enum: ['pending', 'active', 'disabled'], default: 'active' },
    tokenVersion: { type: Number, default: 0 }, // going up by 1 logs the person out everywhere
    failedLogins: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    maxPhotos: { type: Number, default: 30, min: 0, max: 500 },
    maxBytes: { type: Number, default: 40 * 1024 * 1024, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.User || mongoose.model('User', schema);
