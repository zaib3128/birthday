// Clean up anything that comes from the admin form before it reaches the database.
// Only text and numbers are used. Lists and objects inside a value are dropped (a very deep one could even crash a conversion to text).
const simple = (v) => (typeof v === 'string' || typeof v === 'number' ? v : '');
const text = (v, max) => String(simple(v)).trim().slice(0, max);
const whole = (v, min, max, fallback) => {
  const n = Number.parseInt(simple(v), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const list = (v, maxItems, maxLen) =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split('\n') : []).map((x) => text(x, maxLen)).filter(Boolean).slice(0, maxItems);
const daysIn = (month) => new Date(2000, month, 0).getDate(); // 2000 was a leap year, so 29 February is allowed

export function cleanSettings(body = {}) {
  const out = {};
  if ('nickname' in body) out.nickname = text(body.nickname, 40) || 'Sweety';
  if ('tagline' in body) out.tagline = text(body.tagline, 200);
  if ('bookTitle' in body) out.bookTitle = text(body.bookTitle, 12) || 'SketchBook';
  if ('birthdayMonth' in body) out.birthdayMonth = whole(body.birthdayMonth, 1, 12, 8);
  if ('birthdayDay' in body) out.birthdayDay = whole(body.birthdayDay, 1, 'birthdayMonth' in out ? daysIn(out.birthdayMonth) : 31, 26);
  if ('tzOffsetMinutes' in body) out.tzOffsetMinutes = whole(body.tzOffsetMinutes, -720, 840, 300);
  for (const [key, maxItems, maxLen] of [['polaroidCaptions', 9, 40], ['spaceNames', 14, 30], ['bookNotes', 8, 80]]) {
    if (key in body) {
      const items = list(body[key], maxItems, maxLen);
      if (items.length) out[key] = items; // an empty list is ignored, so the old words stay
    }
  }
  return out;
}

// What visitors are allowed to see.
export function publicSettings(doc) {
  const { nickname, tagline, bookTitle, birthdayMonth, birthdayDay, tzOffsetMinutes, polaroidCaptions, spaceNames, bookNotes } = doc;
  return { nickname, tagline, bookTitle, birthdayMonth, birthdayDay, tzOffsetMinutes, polaroidCaptions, spaceNames, bookNotes };
}
