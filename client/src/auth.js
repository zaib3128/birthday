import { useCallback, useEffect, useState } from 'react';
import { getMe } from './api.js';

// The login ticket is kept in this browser, so you stay logged in for 7 days.
const KEY = 'birthdayToken';
const read = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
const write = (value) => { try { value ? localStorage.setItem(KEY, value) : localStorage.removeItem(KEY); } catch { /* storage can be blocked, then we simply stay logged in until the page closes */ } };
try { localStorage.removeItem('birthdayAdminToken'); } catch { /* the ticket of the old one-password version is useless now */ }

export function useAuth() {
  const [token, setToken] = useState(read);
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(Boolean(read()));
  const [problem, setProblem] = useState('');

  const logout = useCallback(() => { write(''); setToken(''); setUser(null); setChecking(false); setProblem(''); }, []);
  const signIn = useCallback((newToken, newUser) => { write(newToken); setToken(newToken); setUser(newUser); setChecking(false); setProblem(''); }, []);

  // A ticket from an earlier visit: ask the server who it belongs to (and whether it still works).
  useEffect(() => {
    if (!token || user) return undefined;
    let alive = true;
    setChecking(true);
    getMe(token)
      .then((d) => { if (alive) { setUser(d.user); setChecking(false); } })
      .catch((err) => {
        if (!alive) return;
        if (err.status === 401) logout();
        else { setProblem(err.message); setChecking(false); }
      });
    return () => { alive = false; };
  }, [token, user, logout]);

  return { token, user, checking, problem, signIn, logout };
}
