import { useEffect, useState } from 'react';
import { getCountdown, monthName } from '../lib/countdown.js';

// Screen 1: the black page with the big faint number and the live countdown.
export default function Home({ settings }) {
  const { birthdayDay: day, birthdayMonth: month, tzOffsetMinutes: tz } = settings;
  const label = `${day} ${monthName(month)}`;
  const [text, setText] = useState(label);

  useEffect(() => {
    const tick = () => {
      const c = getCountdown({ birthdayDay: day, birthdayMonth: month, tzOffsetMinutes: tz });
      document.body.classList.toggle('today', c.today); // on the day, the page turns pink
      setText(c.text);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => { clearInterval(id); document.body.classList.remove('today'); };
  }, [day, month, tz]);

  return (
    <section className="screen" id="home">
      <h1 className="sr">{label}</h1>
      <div className="ghost" aria-hidden="true">{day}</div>
      <p className="clock">{text}</p>
      <a className="hint" href="#wish">Scroll</a>
    </section>
  );
}
