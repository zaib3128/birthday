import { Children, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { heart } from '../placeholder.js';
import { useReducedMotion, useSeen } from '../hooks.js';

// Small helpers for the things stuck on the pages. Numbers are x, y, size (in %) and tilt (in degrees).
const at = (x, y, w, r, more) => ({ left: `${x}%`, top: `${y}%`, ...(w ? { width: `${w}%` } : {}), transform: `rotate(${r || 0}deg)`, ...more });
const T = {
  p: (src, x, y, w, r) => <div className="po" style={at(x, y, w, r)}><img src={src} alt="" /></div>, // polaroid
  s: (srcs, x, y, w, r) => <div className="fs" style={at(x, y, w, r)}>{srcs.map((s, i) => <img key={i} src={s} alt="" />)}</div>, // photo strip
  n: (text, x, y, w, r) => <p className="nt" style={at(x, y, w, r)}>{text}</p>, // note
  e: (emoji, x, y, s, r) => <b className="st" style={at(x, y, 0, r, { fontSize: `calc(var(--u)*${s})` })}>{emoji}</b>, // sticker
  t: (kind, x, y, w, h, r) => <i className={`tr ${kind}`} style={at(x, y, w, r, { height: `${h}%` })} />, // torn paper
  w: (x, y, w, r) => <i className="tp" style={at(x, y, w, r)} />, // tape
};
const pg = (items, dark) => <div className={`pg${dark ? ' dk' : ''}`}>{Children.toArray(items)}</div>;

// All 8 pages: 0 = front cover, 1 to 6 = inside pages, 7 = back cover.
function buildPages(photos, notes, title) {
  let pi = 0;
  const pic = () => (photos.length ? photos[pi++ % photos.length] : heart(pi++ * 5 + 2));
  const n = (i) => notes[i] ?? '';
  return [
    pg([T.t('nw', 0, 0, 62, 34, 0), T.e('🌕', 70, 1, 19, 0), T.e('🎀', 33, -2, 17, -8), T.e('🍒', 38, 3, 20, 4), T.e('💋', 3, 13, 14, -14),
      <div className="rn" style={{ left: '5%', top: '30%', width: '90%' }}>{[...title].map((c, i) => <s key={i}>{c}</s>)}</div>,
      T.e('📷', 16, 44, 46, -2), T.t('pk', 52, 60, 48, 40, 0), T.e('💋', 70, 62, 17, 12), T.e('🌹', 3, 74, 19, 0), T.e('⚖️', 38, 79, 14, 0), T.e('🦋', 74, 44, 14, 10)], true),
    pg([T.t('nw', 0, 0, 56, 62, 0), T.w(26, 10, 16, -6), T.p(pic(), 24, 13, 36, -3), T.n(n(0), 16, 58, 40, 0), T.e('🦋', 4, 64, 22, -8), T.e('🐹', 38, 72, 24, 0)]),
    pg([T.s([pic(), pic(), pic()], 70, 7, 22, 7), T.e('🎀', 74, 1, 17, 6), T.n(n(1), 10, 12, 44, 0), T.e('🐱', 10, 26, 17, -6), T.e('🪩', 24, 58, 36, 0), T.e('✨', 54, 56, 13, 0), T.t('nw', 54, 66, 46, 34, 0)]),
    pg([T.e('🎀', 8, 4, 15, -6), T.e('🐱', 3, 14, 28, -4), T.p(pic(), 34, 9, 40, 6), T.t('gh', 0, 60, 38, 40, 0), T.e('🌕', 10, 64, 26, 0), T.n(n(2), 44, 68, 42, -2)]),
    pg([T.p(pic(), 50, 7, 40, -3), T.e('🌸', 38, 3, 15, 8), T.e('💐', 16, 54, 36, -6), T.n(n(3), 64, 50, 28, -5), T.t('gr', 54, 58, 46, 42, 0), T.e('🌷', 6, 10, 16, -8)]),
    pg([T.e('💿', -16, 6, 46, -6), T.n(n(4), 22, 2, 48, 0), T.p(pic(), 54, 15, 28, 6), T.p(pic(), 50, 40, 30, -5), T.e('⭐', 8, 62, 17, 0), T.e('🐱', 30, 66, 25, 0), T.t('nw', 0, 80, 62, 20, 0)]),
    pg([T.n(n(5), 20, 5, 62, 0), T.p(pic(), 10, 22, 32, -4), T.p(pic(), 30, 46, 32, 5), T.e('🐈', 8, 68, 22, 0), T.t('pk', 58, 40, 42, 60, 0), T.e('🌷', 64, 70, 17, 8)]),
    pg([T.e('🪩', 6, 3, 24, 0), T.e('🎀', 10, 24, 21, -6), T.e('💿', 24, 32, 50, 0), T.e('🔒', 66, 22, 20, 8),
      <div className="tk" style={{ left: '5%', top: '60%', transform: 'rotate(-6deg)' }}>ADMIT ONE</div>,
      T.n(n(6), 44, 76, 48, -3), T.n(n(7), 8, 84, 26, 2), T.e('💖', 76, 66, 18, 0)], true),
  ];
}
// Each paper leaf has a front (right-hand page) and a back (left-hand page of the next spread).
const LEAVES = [[0, 1], [2, 3], [4, 5], [6, 7]];

// Screen 4: a sketchbook. Click the right page to go forward, the left page to go back.
export default function Sketchbook({ settings, photos }) {
  const sec = useRef(null), seen = useSeen(sec, .5), reduce = useReducedMotion();
  const [cur, setCur] = useState(0); // how many leaves are turned over (0 = closed front, 4 = closed back)
  const [moving, setMoving] = useState(null); // the leaf that is turning right now
  const busy = useRef(false), timer = useRef(0);
  const pages = useMemo(() => buildPages(photos, settings.bookNotes, settings.bookTitle), [photos, settings.bookNotes, settings.bookTitle]);

  const turn = useCallback((dir) => {
    const to = cur + dir;
    if (busy.current || to < 0 || to > LEAVES.length) return;
    busy.current = true;
    setMoving(dir > 0 ? cur : cur - 1);
    setCur(to);
    timer.current = setTimeout(() => { setMoving(null); busy.current = false; }, reduce ? 30 : 980);
  }, [cur, reduce]);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Arrow keys work too, while this screen is on show.
  const turnRef = useRef(turn);
  turnRef.current = turn;
  useEffect(() => {
    const onKey = (e) => {
      if (!seen.current) return;
      if (e.key === 'ArrowRight') turnRef.current(1);
      else if (e.key === 'ArrowLeft') turnRef.current(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [seen]);

  return (
    <section className="screen" id="book" ref={sec}>
      <div className="bk" role="group" aria-label="Sketchbook. Click the pages to turn them."
        onClick={(e) => turn(e.clientX >= e.currentTarget.getBoundingClientRect().left ? 1 : -1)}>
        {LEAVES.map(([front, back], i) => (
          <div key={i} className={`leaf${i < cur ? ' flip' : ''}`} style={{ zIndex: moving === i ? 50 : i < cur ? i + 1 : LEAVES.length - i }}>
            <div className="face fr">{pages[front]}</div>
            <div className="face bf">{pages[back]}</div>
          </div>
        ))}
        <i className="coil" />
      </div>
      <p className="hintb">Click the pages to turn them</p>
    </section>
  );
}
