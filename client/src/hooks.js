import { useEffect, useRef, useState } from 'react';

export function useReducedMotion() {
  const [reduce] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  return reduce;
}

// A ref that is true while the element is on screen. Animations use it to pause when you scroll away.
export function useSeen(ref, threshold = 0) {
  const seen = useRef(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { seen.current = e.isIntersecting; }, { threshold });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [ref, threshold]);
  return seen;
}
