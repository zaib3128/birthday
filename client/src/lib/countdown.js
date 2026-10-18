export const monthName = (m, style = 'long') => new Date(2001, m - 1, 1).toLocaleString('en', { month: style });

// Time left until the next birthday (it starts at midnight in her time zone).
export function getCountdown({ birthdayMonth, birthdayDay, tzOffsetMinutes }, now = Date.now()) {
  const offset = tzOffsetMinutes * 60_000, month = birthdayMonth - 1;
  const year = new Date(now + offset).getUTCFullYear();
  let start = Date.UTC(year, month, birthdayDay) - offset;
  if (now >= start + 864e5) start = Date.UTC(year + 1, month, birthdayDay) - offset; // this year's day is over
  const today = now >= start;
  const s = Math.floor(Math.max(start - now, 0) / 1000);
  const pad = (v) => String(v).padStart(2, '0');
  const time = [Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60].map(pad).join(':');
  return { today, text: today ? 'Happy birthday' : `${Math.floor(s / 86400)}D · ${time} to go` };
}
