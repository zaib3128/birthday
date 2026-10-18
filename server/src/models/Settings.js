import mongoose from 'mongoose';

// One document per person holds everything they can change from /admin. "owner" says whose it is.
const schema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, // "main" for the very first site, "site:<owner id>" for the others
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, sparse: true },
    slug: { type: String, unique: true, sparse: true, lowercase: true, maxlength: 40 }, // the address of the public site: /s/<slug>
    nickname: { type: String, default: 'Sweety', maxlength: 40 },
    tagline: { type: String, default: "May this year bring you closer to everything you're chasing.", maxlength: 200 },
    bookTitle: { type: String, default: 'SketchBook', maxlength: 12 },
    birthdayMonth: { type: Number, default: 8, min: 1, max: 12 },
    birthdayDay: { type: Number, default: 26, min: 1, max: 31 },
    tzOffsetMinutes: { type: Number, default: 300, min: -720, max: 840 }, // minutes ahead of UTC (Pakistan = 300)
    polaroidCaptions: {
      type: [String],
      default: ['Cutie 🎀', 'My Love 💜', 'Sunshine 🌞', 'Baddie 😎', 'Angel 🪽', 'Pretty ✨', 'Beautiful 🌸', 'Dream Girl 💫', 'Queen 👑'],
    },
    spaceNames: {
      type: [String],
      default: ['Babe', 'Sweetheart', 'Darling', 'Sweetie', 'Angel', 'Icon', 'Queen', 'Pretty', 'Gorgeous', 'Cutie', 'Love', 'Star', 'Beautiful', 'Princess'],
    },
    bookNotes: {
      type: [String],
      default: [
        'you make ordinary days feel like magic', 'made of stars, flowers & you', 'every day with you is my favourite', 'always you',
        'forever starts with you', 'every wish I make has your name on it', 'my love, you’re doing great', 'dream big',
      ],
    },
    hearts: { type: Number, default: 0 }, // how many times the heart was tapped
  },
  { timestamps: true }
);

export default mongoose.models.Settings || mongoose.model('Settings', schema);
