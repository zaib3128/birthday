import { useEffect, useRef, useState } from 'react';
import { heart } from '../placeholder.js';
import { useReducedMotion, useSeen } from '../hooks.js';
import { monthName } from '../lib/countdown.js';

// The ribbon's path (x and y as fractions of the screen): in from the bottom-left, round a loop, out to the top-right.
const P = [[-.08, 1.04], [.10, 1.04], [.26, 1.02], [.38, .98], [.47, .91], [.525, .78], [.53, .56], [.49, .43], [.44, .385], [.395, .43],
  [.365, .58], [.385, .78], [.45, .91], [.56, .93], [.70, .84], [.85, .69], [1.0, .53], [1.12, .40]];
const cr = (a, b, c, d, t) => .5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);

// Screen 2: "Happy Birthday" with a ribbon of photos gliding along a loop.
export default function Wish({ settings, photos }) {
  const sec = useRef(null), tiles = useRef([]);
  const seen = useSeen(sec), reduce = useReducedMotion();
  const [count, setCount] = useState(24);
  const [portrait, setPortrait] = useState(false);
  const [dragging, setDragging] = useState(false);
  const g = useRef({ X: [], Y: [], D: [], len: 1, tile: 100, pitch: 100, off: 0, speed: 0, base: 0, hover: false, drag: false, lx: 0 });

  useEffect(() => {
    const s = g.current, el = sec.current;

    // Put every photo at its place along the path.
    const place = () => {
      const { X, Y, D, len, tile, pitch, off } = s;
      tiles.current.forEach((t, i) => {
        if (!t) return;
        let d = (off + i * pitch) % len;
        if (d < 0) d += len;
        let lo = 0, hi = D.length - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (D[m] <= d) lo = m; else hi = m; }
        const f = (d - D[lo]) / (D[hi] - D[lo] || 1);
        const x = X[lo] + (X[hi] - X[lo]) * f, y = Y[lo] + (Y[hi] - Y[lo]) * f;
        const a = Math.atan2(Y[hi] - Y[lo], X[hi] - X[lo]) * 57.2958;
        t.style.transform = `translate(${(x - tile / 2).toFixed(1)}px,${(y - tile / 2).toFixed(1)}px) rotate(${a.toFixed(1)}deg)`;
      });
    };

    // Work out the path and the photo size for this screen size.
    const layout = () => {
      const W = el.clientWidth, H = el.clientHeight, por = W < 700 || W < H * .9;
      const tile = por ? Math.max(54, Math.min(W * .17, 76)) : Math.max(64, Math.min(W * .055, H * .125, 120));
      const k = tile / 104, sx = por ? 1918 * k : W, sy = por ? 874 * k : H;
      const ox = por ? W * .5 - .455 * sx : 0, oy = por ? H * .7 - .65 * sy : 0;
      const pts = P.map(([x, y]) => [ox + x * sx, oy + y * sy]);
      const q = [pts[0], ...pts, pts[pts.length - 1]];
      const X = [], Y = [], D = [0];
      for (let i = 1; i < q.length - 2; i++) for (let j = 0; j < 24; j++) {
        const t = j / 24;
        X.push(cr(q[i - 1][0], q[i][0], q[i + 1][0], q[i + 2][0], t));
        Y.push(cr(q[i - 1][1], q[i][1], q[i + 1][1], q[i + 2][1], t));
      }
      X.push(pts[pts.length - 1][0]); Y.push(pts[pts.length - 1][1]);
      for (let i = 1; i < X.length; i++) D.push(D[i - 1] + Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]));
      const len = D[D.length - 1], n = Math.max(8, Math.floor(len / (tile * 1.06)));
      Object.assign(s, { X, Y, D, len, tile, pitch: len / n, base: reduce ? 0 : W * .1 });
      el.style.setProperty('--t', tile + 'px');
      setPortrait(por);
      setCount(n);
    };
    layout();
    window.addEventListener('resize', layout);

    let raf = 0, last = performance.now();
    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, .05);
      last = now;
      s.speed += ((s.hover || s.drag ? 0 : s.base) - s.speed) * Math.min(dt * 4, 1); // slows down when you hover or drag
      if (seen.current) { s.off += s.speed * dt; place(); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', layout); };
  }, [reduce, seen]);

  // Drag the ribbon with the mouse or your finger.
  const down = (e) => {
    if (e.button) return;
    g.current.drag = true; g.current.lx = e.clientX;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    const s = g.current;
    if (s.drag) { s.off += e.clientX - s.lx; s.lx = e.clientX; }
  };
  const up = () => { g.current.drag = false; setDragging(false); };

  return (
    <section className={`screen${portrait ? ' portrait' : ''}${dragging ? ' drag' : ''}`} id="wish" ref={sec}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <p className="date">{monthName(settings.birthdayMonth, 'short')} {settings.birthdayDay}</p>
      <div className="copy">
        <h2 className="title">
          <span>Happy</span><span className="b">Birthday</span><span className="b n">{settings.nickname}</span>
        </h2>
        <i className="rule" />
        <p className="note">{settings.tagline}</p>
      </div>
      <div className="ribbon" aria-hidden="true"
        onPointerOver={(e) => { g.current.hover = !!e.target.closest('.tile'); }}
        onPointerLeave={() => { g.current.hover = false; }}>
        {Array.from({ length: count }, (_, i) => (
          <div className="tile" key={i} ref={(el) => { tiles.current[i] = el; }}>
            <img src={photos.length ? photos[i % photos.length] : heart(i)} alt="" draggable={false} />
          </div>
        ))}
      </div>
      <div className="foot"><i /><span>Made for you</span></div>
    </section>
  );
}
