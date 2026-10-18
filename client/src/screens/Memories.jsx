import { useEffect, useRef, useState } from 'react';
import { heart, stickerUrl } from '../placeholder.js';
import { useSeen } from '../hooks.js';
import { sendHeart } from '../api.js';

// Where each polaroid starts: x and y (fractions of the screen) and its tilt.
const SET = [[.15, .30, -8], [.19, .74, -7], [.47, .80, 2], [.55, .36, 6], [.82, .52, 8], [.80, .27, 4], [.26, .60, 7], [.54, .58, -8], [.76, .62, -6]];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Screen 3: polaroids on a table. Drag them around, throw them, tap the heart.
export default function Memories({ settings, photos, hearts: startHearts, slug }) {
  const sec = useRef(null), els = useRef([]);
  const seen = useSeen(sec);
  const [shown, setShown] = useState(false);
  const [hearts, setHearts] = useState(startHearts);
  const [on, setOn] = useState(false);
  const [floaters, setFloaters] = useState([]);
  const g = useRef({
    W: 1, H: 1, cw: 300, ch: 390, z: 10, held: -1, ox: 0, oy: 0,
    cards: SET.map(([fx, fy, r]) => ({ fx, fy, r, x: 0, y: 0, vx: 0, vy: 0, s: 1, t: 0 })),
  });

  // The photos float in the first time this screen appears.
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: .25 });
    io.observe(sec.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const s = g.current, el = sec.current;
    const render = (c, i) => {
      const n = els.current[i];
      if (n) n.style.transform = `translate(${(c.x - s.cw / 2).toFixed(1)}px,${(c.y - s.ch / 2).toFixed(1)}px) rotate(${(c.r + c.t).toFixed(2)}deg) scale(${c.s.toFixed(3)})`;
    };
    const fit = () => {
      s.W = el.clientWidth; s.H = el.clientHeight;
      const first = els.current[0];
      if (first) { s.cw = first.offsetWidth; s.ch = first.offsetHeight; }
      s.cards.forEach((c, i) => { c.x = c.fx * s.W; c.y = c.fy * s.H; render(c, i); });
    };
    fit();
    window.addEventListener('resize', fit);

    let raf = 0;
    const loop = () => {
      if (seen.current) {
        s.cards.forEach((c, i) => {
          const lifted = s.held === i;
          if (lifted) { c.vx *= .8; c.vy *= .8; }
          else if (Math.abs(c.vx) > .1 || Math.abs(c.vy) > .1) { // a thrown photo keeps sliding, then slows down
            c.x = clamp(c.x + c.vx, -.05 * s.W, 1.05 * s.W);
            c.y = clamp(c.y + c.vy, .05 * s.H, s.H);
            c.vx *= .92; c.vy *= .92;
          }
          const ts = lifted ? 1.06 : 1, tt = lifted ? clamp(c.vx * .8, -12, 12) : 0;
          c.s += (ts - c.s) * .25; c.t += (tt - c.t) * .2;
          c.fx = c.x / s.W; c.fy = c.y / s.H;
          render(c, i);
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', fit); };
  }, [seen]);

  // Pick up a photo and drag it. The one you hold goes on top.
  const down = (e) => {
    const el = e.target.closest('.card');
    if (!el || e.button) return;
    const s = g.current, i = els.current.indexOf(el), c = s.cards[i], b = e.currentTarget.getBoundingClientRect();
    s.held = i; s.ox = c.x - (e.clientX - b.left); s.oy = c.y - (e.clientY - b.top);
    c.vx = c.vy = 0;
    el.style.zIndex = ++s.z;
    el.classList.add('lift');
    el.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    const s = g.current;
    if (s.held < 0) return;
    const c = s.cards[s.held], b = e.currentTarget.getBoundingClientRect();
    const nx = e.clientX - b.left + s.ox, ny = e.clientY - b.top + s.oy;
    c.vx = c.vx * .5 + (nx - c.x) * .5; c.vy = c.vy * .5 + (ny - c.y) * .5;
    c.x = clamp(nx, -.05 * s.W, 1.05 * s.W); c.y = clamp(ny, .05 * s.H, s.H);
  };
  const drop = () => {
    const s = g.current;
    if (s.held < 0) return;
    const c = s.cards[s.held];
    els.current[s.held]?.classList.remove('lift');
    c.vx = clamp(c.vx, -40, 40); c.vy = clamp(c.vy, -40, 40);
    s.held = -1;
  };

  // The small heart: little hearts float up, and the total is saved in the database.
  const like = () => {
    const id = Date.now();
    setFloaters((f) => [...f, ...Array.from({ length: 7 }, (_, i) => ({ id: id + i, left: 6 + Math.random() * 30, dx: Math.round(Math.random() * 90 - 45), delay: i * 80 }))]);
    if (!on && slug) sendHeart(slug).then((r) => setHearts(r.hearts)).catch(() => {});
    setOn(!on);
  };

  const caps = settings.polaroidCaptions;
  return (
    <section className="screen" id="memories" ref={sec} style={{ '--st': stickerUrl }}>
      <div className={`pile${shown ? ' in' : ''}`} onPointerDown={down} onPointerMove={move} onPointerUp={drop} onPointerCancel={drop}>
        {SET.map((_, i) => (
          <div className="card" key={i} ref={(el) => { els.current[i] = el; }} style={{ '--d': `${i * 70}ms` }}>
            <img src={photos.length ? photos[(i + 3) % photos.length] : heart(i * 3 + 1)} alt="" draggable={false} />
            <p>{caps[i % caps.length]}</p>
          </div>
        ))}
      </div>
      <span className="spark" aria-hidden="true">✨</span>
      <div className="likeBox">
        <button className={`like${on ? ' on' : ''}`} type="button" aria-label="Send a heart" onClick={like}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21C3.5 14.6 2.2 9.3 4.9 6 7 3.5 10.6 4 12 7c1.4-3 5-3.5 7.1-1 2.7 3.3 1.4 8.6-7.1 15z" /></svg>
        </button>
        {floaters.map((f) => (
          <i key={f.id} className="fh" style={{ left: f.left, '--dx': `${f.dx}px`, animationDelay: `${f.delay}ms` }}
            onAnimationEnd={() => setFloaters((a) => a.filter((x) => x.id !== f.id))} />
        ))}
        {hearts > 0 && <span className="hc">{hearts}</span>}
      </div>
    </section>
  );
}
