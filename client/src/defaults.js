// Used when the server is not reachable, and to fill in anything that is missing.
export const DEFAULTS = {
  nickname: 'Sweety',
  tagline: "May this year bring you closer to everything you're chasing.",
  bookTitle: 'SketchBook',
  birthdayMonth: 8,
  birthdayDay: 26,
  tzOffsetMinutes: 300,
  polaroidCaptions: ['Cutie 🎀', 'My Love 💜', 'Sunshine 🌞', 'Baddie 😎', 'Angel 🪽', 'Pretty ✨', 'Beautiful 🌸', 'Dream Girl 💫', 'Queen 👑'],
  spaceNames: ['Babe', 'Sweetheart', 'Darling', 'Sweetie', 'Angel', 'Icon', 'Queen', 'Pretty', 'Gorgeous', 'Cutie', 'Love', 'Star', 'Beautiful', 'Princess'],
  bookNotes: [
    'you make ordinary days feel like magic', 'made of stars, flowers & you', 'every day with you is my favourite', 'always you',
    'forever starts with you', 'every wish I make has your name on it', 'my love, you’re doing great', 'dream big',
  ],
};

export function mergeSettings(raw = {}) {
  const out = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    const v = raw[key];
    if (Array.isArray(v) ? v.length : v !== undefined && v !== null) out[key] = v;
  }
  return out;
}
