import { useEffect, useMemo, useState } from 'react';
import { asset } from './api.js';
import { mergeSettings } from './defaults.js';
import { useReducedMotion } from './hooks.js';
import { monthName } from './lib/countdown.js';
import Intro from './screens/Intro.jsx';
import Home from './screens/Home.jsx';
import Wish from './screens/Wish.jsx';
import Memories from './screens/Memories.jsx';
import Sketchbook from './screens/Sketchbook.jsx';
import Space from './screens/Space.jsx';

// The whole birthday website: the 5 screens, one below the other.
// "data" is { slug, settings, photos, hearts }. The pages in pages/SitePages.jsx load it from the server.
export default function Site({ data }) {
  const reduce = useReducedMotion();
  const [ready, setReady] = useState(false); // the page is revealed and scrolling is unlocked
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (reduce) { setReady(true); setIntroDone(true); } // no intro for people who prefer less motion
  }, [reduce]);

  useEffect(() => {
    document.body.classList.toggle('ready', ready);
    return () => document.body.classList.remove('ready');
  }, [ready]);

  const settings = useMemo(() => mergeSettings(data?.settings), [data]);
  const photos = useMemo(() => (data?.photos || []).map((p) => asset(p.url)), [data]);

  useEffect(() => {
    document.title = `${settings.birthdayDay} ${monthName(settings.birthdayMonth)}`;
  }, [settings.birthdayDay, settings.birthdayMonth]);

  return (
    <>
      <main>
        <Home settings={settings} />
        <Wish settings={settings} photos={photos} />
        <Memories settings={settings} photos={photos} hearts={data.hearts || 0} slug={data.slug} />
        <Sketchbook settings={settings} photos={photos} />
        <Space settings={settings} photos={photos} />
      </main>
      {!introDone && !reduce && (
        <Intro
          day={settings.birthdayDay}
          label={`${settings.birthdayDay} ${monthName(settings.birthdayMonth)}`}
          onReveal={() => setReady(true)}
          onDone={() => setIntroDone(true)}
        />
      )}
    </>
  );
}
