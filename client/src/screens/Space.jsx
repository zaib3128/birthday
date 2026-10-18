import { useEffect, useMemo, useRef } from 'react';
import { heart } from '../placeholder.js';
import { useReducedMotion, useSeen } from '../hooks.js';

const FAR = -2800, CUT = 650, SPAN = CUT - FAR; // each photo flies from FAR (far away) to CUT (just past you), then starts again
const ASPECT = [1.28, 1.1, 0.92];
const seeded = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// Screen 5: photos flying through space. Move the mouse to look around, hover a photo to slow down.
export default function Space({ settings, photos }) {
  const names = settings.spaceNames;
  const sec = useRef(null), world = useRef(null), stars = useRef(null), els = useRef([]);
  const seen = useSeen(sec), reduce = useReducedMotion();
  const g = useRef({ sw: 1, sh: 1, mx: 0, my: 0, px: 0, py: 0, fly: 1, flyTo: 1, t: 0 });

  // Where each photo sits in space. Made once, with a fixed seed so it looks the same every time.
  const orbs = useMemo(() => {
    const rnd = seeded(7);
    return names.map((_, i) => ({
      ang: i * 2.39996 + rnd() * .3, rad: Math.sqrt((i + .5) / names.length), z0: (i / names.length) * SPAN + rnd() * 150,
      rz: (rnd() - .5) * 40, rx: (rnd() - .5) * 30, ry: (rnd() - .5) * 40, ph: rnd() * 6.28,
    }));
  }, [names.length]);

  useEffect(() => {
    const s = g.current, el = sec.current;
    const draw = () => orbs.forEach((c, i) => {
      const n = els.current[i];
      if (!n) return;
      const d = (c.z0 + s.t * 640) % SPAN, z = FAR + d;
      const o = Math.min(1, d / 350, (CUT - z) / 200); // fade in far away, fade out as it passes you
      const x = Math.cos(c.ang) * c.rad * s.sw * .62, y = Math.sin(c.ang) * c.rad * s.sh * .62;
      n.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,${z.toFixed(1)}px) ` +
        `rotateX(${(c.rx + Math.sin(s.t * .5 + c.ph) * 4).toFixed(2)}deg) rotateY(${(c.ry + Math.cos(s.t * .4 + c.ph) * 5).toFixed(2)}deg) rotateZ(${c.rz.toFixed(2)}deg)`;
      n.style.opacity = o.toFixed(3);
      n.style.visibility = o < .02 ? 'hidden' : 'visible';
    });
    const sky = () => {
      s.sw = el.clientWidth; s.sh = el.clientHeight;
      const rnd = seeded(99), dots = [];
      for (let i = 0; i < 160; i++) dots.push(`${Math.round(rnd() * s.sw)}px ${Math.round(rnd() * s.sh)}px 0px rgba(255,255,255,${(.15 + rnd() * .6).toFixed(2)})`);
      stars.current.style.boxShadow = dots.join(',');
      draw();
    };
    sky();
    window.addEventListener('resize', sky);

    let raf = 0, last = performance.now();
    const spin = (now) => {
      const dt = Math.min((now - last) / 1000, .05);
      last = now;
      if (seen.current) {
        s.fly += (s.flyTo - s.fly) * Math.min(dt * 3, 1);
        if (!reduce) s.t += dt * s.fly;
        s.px += (s.mx - s.px) * Math.min(dt * 4, 1); s.py += (s.my - s.py) * Math.min(dt * 4, 1);
        world.current.style.perspectiveOrigin = `${(50 + s.px * 12).toFixed(2)}% ${(50 + s.py * 12).toFixed(2)}%`;
        draw();
      }
      raf = requestAnimationFrame(spin);
    };
    raf = requestAnimationFrame(spin);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', sky); };
  }, [orbs, reduce, seen]);

  const look = (e) => {
    const r = sec.current.getBoundingClientRect();
    g.current.mx = (e.clientX - r.left) / (r.width || 1) - .5;
    g.current.my = (e.clientY - r.top) / (r.height || 1) - .5;
  };

  return (
    <section className="screen" id="space" ref={sec} onPointerMove={look}
      onPointerLeave={() => { Object.assign(g.current, { mx: 0, my: 0, flyTo: 1 }); }}>
      <i className="grid" aria-hidden="true" />
      <i className="stars" ref={stars} aria-hidden="true" />
      <div className="world" ref={world} onPointerOver={(e) => { g.current.flyTo = e.target.closest('.sc') ? .2 : 1; }}>
        <div className="rig">
          {names.map((name, i) => (
            <figure className="sc" key={i} ref={(el) => { els.current[i] = el; }} style={{ '--a': ASPECT[i % 3] }}>
              <img src={photos.length ? photos[(i * 3 + 1) % photos.length] : heart(i * 7 + 3)} alt="" draggable={false} />
              <figcaption>{name}</figcaption>
            </figure>
          ))}
        </div>
      </div>
      <p className="hintb dim">Move your mouse · hover a photo</p>
    </section>
  );
}
