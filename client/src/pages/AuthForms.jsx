import { useEffect, useState } from 'react';
import { getAuthConfig, login, register } from '../api.js';

// Log in, or sign up. "onSignedIn(token, user)" is called when it worked.
export default function AuthForms({ onSignedIn, problem }) {
  const [tab, setTab] = useState('login');
  const [mode, setMode] = useState(null); // "closed", "approval" or "open"
  const [serverProblem, setServerProblem] = useState(problem || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  useEffect(() => {
    let alive = true;
    getAuthConfig().then((d) => alive && setMode(d.signupMode)).catch((err) => alive && setServerProblem(err.message));
    return () => { alive = false; };
  }, []);

  const switchTab = (next) => { setTab(next); setError(''); setWaiting(''); };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      if (tab === 'login') {
        const res = await login({ email: form.email, password: form.password });
        onSignedIn(res.token, res.user);
      } else {
        const res = await register(form);
        if (res.token) onSignedIn(res.token, res.user);
        else { setWaiting(res.message); setForm({ name: '', email: '', password: '' }); }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ad-card ad-login">
      <h1>Birthday sites</h1>
      <p className="ad-hint">Log in to change your pictures and words.</p>
      {serverProblem && <p className="ad-msg ad-err" role="alert">The server says: {serverProblem}</p>}
      <div className="ad-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'login'} className={tab === 'login' ? 'on' : ''} onClick={() => switchTab('login')}>Log in</button>
        <button type="button" role="tab" aria-selected={tab === 'signup'} className={tab === 'signup' ? 'on' : ''} onClick={() => switchTab('signup')} disabled={mode === 'closed'}>Sign up</button>
      </div>

      {waiting ? (
        <div>
          <p className="ad-msg">{waiting}</p>
          <p><button type="button" className="ad-ghost" onClick={() => switchTab('login')}>Back to log in</button></p>
        </div>
      ) : (
        <form onSubmit={submit}>
          {tab === 'signup' && (
            <label>Your name<input value={form.name} onChange={set('name')} autoComplete="name" maxLength={60} required /></label>
          )}
          <label>Email<input type="email" value={form.email} onChange={set('email')} autoComplete="username" maxLength={254} required autoFocus /></label>
          <label>Password<input type="password" value={form.password} onChange={set('password')} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} minLength={tab === 'signup' ? 8 : undefined} maxLength={128} required /></label>
          {tab === 'signup' && (
            <>
              <p className="ad-hint">At least 8 characters. There is no email reset, so choose one you will remember.</p>
              {mode === 'approval' && <p className="ad-hint">New accounts are checked by the owner of this site first. You can log in once you are approved.</p>}
              <p className="ad-hint">Please know: the owner of this site (the super admin) can see everything stored here, including pictures and words.</p>
            </>
          )}
          {mode === 'closed' && tab === 'login' && <p className="ad-hint">New accounts are closed right now.</p>}
          {error && <p className="ad-msg ad-err" role="alert">{error}</p>}
          <p><button disabled={busy}>{busy ? 'Please wait…' : tab === 'login' ? 'Log in' : 'Create account'}</button></p>
        </form>
      )}
    </div>
  );
}
