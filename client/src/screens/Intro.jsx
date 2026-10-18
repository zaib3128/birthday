import { useEffect, useRef, useState } from 'react';

const ease = (t, p) => 1 - Math.pow(1 - t, p);
const digits = (n) => Array.from({ length: n + 1 }, (_, i) => <i key={i}>{i % 10}</i>);

// The number rolls up to the birthday day, then zooms into the page.
export default function Intro({ day, label, onReveal, onDone }) {
  const tens = useRef(null), ones = useRef(null);
  const [phase, setPhase] = useState(''); // '' -> 'go' -> 'out'
  const tensN = Math.floor(day / 10);

  useEffect(() => {
    let raf = 0, dead = false;
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const setCol = (el, pos, blur) => {
      if (!el) return;
      el.style.transform = `translateY(${(0.09 - pos * 0.82).toFixed(4)}em)`;
      el.style.filter = blur > 0.4 ? `blur(${Math.min(blur, 10).toFixed(1)}px)` : 'none';
    };
    const out = () => {
      if (dead) return;
      setPhase('out');
      onReveal();
      later(onDone, 1100);
    };
    const run = () => {
      if (dead) return;
      setPhase('go');
      const t0 = performance.now();
      let prev = t0, p1 = 0, p2 = 0;
      const step = (now) => {
        if (dead) return;
        const dt = Math.max(now - prev, 1) / 1000;
        prev = now;
        const q1 = day * ease(Math.min((now - t0) / 1800, 1), 4);
        const q2 = tensN * ease(Math.min((now - t0) / 1500, 1), 3);
        setCol(ones.current, q1, (Math.abs(q1 - p1) / dt) * 0.18);
        setCol(tens.current, q2, (Math.abs(q2 - p2) / dt) * 0.18);
        p1 = q1; p2 = q2;
        if (now - t0 < 1800) raf = requestAnimationFrame(step);
        else {
          setCol(ones.current, day, 0);
          setCol(tens.current, tensN, 0);
          later(out, 600);
        }
      };
      raf = requestAnimationFrame(step);
    };
    const fontReady = document.fonts ? document.fonts.load('700 100px "Space Grotesk"') : Promise.resolve();
    Promise.race([fontReady, new Promise((r) => setTimeout(r, 1500))]).then(run, run);
    return () => { dead = true; cancelAnimationFrame(raf); timers.forEach(clearTimeout); };
  }, [day]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`intro ${phase}`} style={{ opacity: phase ? 1 : 0 }} aria-hidden="true">
      <div className="counter" style={tensN ? undefined : { width: '.6em' }}>
        {tensN > 0 && <div className="col" ref={tens}>{digits(tensN)}</div>}
        <div className="col" ref={ones}>{digits(day)}</div>
      </div>
      <p className="caption">{label}</p>
    </div>
  );
}
