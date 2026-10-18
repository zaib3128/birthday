import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Site from '../Site.jsx';
import { DEFAULTS } from '../defaults.js';
import { getHome, getSiteBySlug } from '../api.js';

// Asks the server for one site. "retry" asks again.
function useSite(load, key) {
  const [state, setState] = useState({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    load()
      .then((data) => alive && setState({ status: 'ok', data }))
      .catch((err) => alive && setState({ status: 'error', err }));
    return () => { alive = false; };
  }, [key, attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  return [state, () => setAttempt((n) => n + 1)];
}

// The home address. It shows the site the super admin chose.
export function HomePage() {
  const [state] = useSite(getHome, 'home');
  if (state.status === 'loading') return null;
  if (state.status === 'ok') return <Site data={state.data} />;
  if (state.err.status === 404) return <Welcome />; // no home site chosen
  // The server is down or not set up yet: show the default words, so the gift never shows an error.
  return <Site data={{ slug: '', settings: DEFAULTS, photos: [], hearts: 0 }} />;
}

// A person's own site, at /s/<their address>.
export function SitePage() {
  const { slug } = useParams();
  const [state, retry] = useSite(() => getSiteBySlug(slug), slug);
  if (state.status === 'loading') return null;
  if (state.status === 'ok') return <Site key={state.data.slug} data={state.data} />;
  if (state.err.status === 404) return <NotFound />;
  return <Problem message={state.err.message} onRetry={retry} />; // never show someone else's words by mistake
}

function useTitle(title) {
  useEffect(() => { document.title = title; }, [title]);
}

function Welcome() {
  useTitle('Birthday sites');
  return (
    <div className="ad">
      <div className="ad-wrap ad-center">
        <p className="ad-big" aria-hidden="true">🤍</p>
        <h1>Make a birthday website for someone you love</h1>
        <p>Upload your own pictures, write your own words, and share one private link. Each person's pictures stay private to them.</p>
        <p><Link className="ad-btn" to="/admin">Log in or sign up</Link></p>
      </div>
    </div>
  );
}

function NotFound() {
  useTitle('Page not found');
  return (
    <div className="ad">
      <div className="ad-wrap ad-center">
        <p className="ad-big" aria-hidden="true">🔍</p>
        <h1>This page does not exist</h1>
        <p>The link may have a typo, or the owner has changed or turned off this site.</p>
        <p><Link className="ad-btn ad-ghost" to="/">Go to the home page</Link></p>
      </div>
    </div>
  );
}

function Problem({ message, onRetry }) {
  useTitle('Could not load');
  return (
    <div className="ad">
      <div className="ad-wrap ad-center">
        <p className="ad-big" aria-hidden="true">📡</p>
        <h1>This page could not be loaded</h1>
        <p>{message}</p>
        <p><button onClick={onRetry}>Try again</button></p>
      </div>
    </div>
  );
}
