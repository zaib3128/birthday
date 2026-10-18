import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listUsers, createUser, updateUser, resetPassword, removeUser, saveConfig } from '../api.js';

const MB = 1024 * 1024;
const mb = (bytes) => String(Math.round((bytes / MB) * 10) / 10);
const when = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'never');

// The super admin's page: who has an account, what they may keep, and the settings for everyone.
export default function Users({ auth }) {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [fresh, setFresh] = useState({ name: '', email: '', password: '', role: 'admin' });

  const load = useCallback(async () => setData(await listUsers(auth.token)), [auth.token]);
  const fail = useCallback((err) => (err.status === 401 ? auth.logout() : setMsg({ text: err.message, bad: true })), [auth]);
  useEffect(() => { load().catch(fail); }, [load, fail]);

  const run = async (action, done) => {
    setBusy(true); setMsg({ text: '', bad: false });
    try {
      await action();
      await load();
      setMsg({ text: done, bad: false });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <p>{msg.text || 'Loading…'}</p>;
  const { users, config, totals, defaults } = data;
  const active = users.filter((u) => u.status === 'active');
  const waiting = users.filter((u) => u.status === 'pending');

  const add = (e) => {
    e.preventDefault();
    run(async () => {
      await createUser(auth.token, fresh);
      setFresh({ name: '', email: '', password: '', role: 'admin' });
      setAdding(false);
    }, 'The person was added. Tell them their email and password.');
  };

  return (
    <>
      <h1>People</h1>
      <p className="ad-hint">{totals.users} {totals.users === 1 ? 'person' : 'people'} · {totals.photos} pictures · {mb(totals.bytes)} MB stored. The free MongoDB Atlas database holds 512 MB in total.</p>
      {busy && <p className="ad-msg" role="status">Working…</p>}
      {msg.text && <p className={`ad-msg${msg.bad ? ' ad-err' : ''}`} role={msg.bad ? 'alert' : 'status'}>{msg.text}</p>}
      {waiting.length > 0 && <p className="ad-msg ad-warn">{waiting.length} {waiting.length === 1 ? 'person is' : 'people are'} waiting for your approval. Press "Approve" on their card below.</p>}

      <section className="ad-card">
        <h2>Settings for everyone</h2>
        <label>Who can sign up?
          <select value={config.signupMode} disabled={busy} onChange={(e) => run(() => saveConfig(auth.token, { signupMode: e.target.value }), 'Saved.')}>
            <option value="approval">New people wait until I approve them (recommended)</option>
            <option value="open">Anyone can sign up and start at once</option>
            <option value="closed">Nobody can sign up (I add people myself)</option>
          </select>
        </label>
        <label>Site shown on the home address
          <select value={config.homeOwner || ''} disabled={busy} onChange={(e) => run(() => saveConfig(auth.token, { homeOwnerId: e.target.value || null }), 'Saved.')}>
            <option value="">None (show a welcome page)</option>
            {active.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
          </select>
        </label>
        <p className="ad-hint">New people may keep {defaults.maxPhotos} pictures and {defaults.maxMB} MB until you change it on their card.</p>
      </section>

      <section className="ad-card ad-slim">
        {!adding ? (
          <button onClick={() => setAdding(true)}>Add a person</button>
        ) : (
          <form onSubmit={add}>
            <h2>Add a person</h2>
            <label>Name<input value={fresh.name} onChange={(e) => setFresh({ ...fresh, name: e.target.value })} maxLength={60} required /></label>
            <label>Email<input type="email" value={fresh.email} onChange={(e) => setFresh({ ...fresh, email: e.target.value })} maxLength={254} required /></label>
            <label>Password (at least 8 characters)<input type="text" value={fresh.password} onChange={(e) => setFresh({ ...fresh, password: e.target.value })} minLength={8} maxLength={128} autoComplete="off" required /></label>
            <label>Role
              <select value={fresh.role} onChange={(e) => setFresh({ ...fresh, role: e.target.value })}>
                <option value="admin">Admin (manages only their own site)</option>
                <option value="superadmin">Super admin (can see and manage everyone)</option>
              </select>
            </label>
            <p><button disabled={busy}>Add</button> <button type="button" className="ad-ghost" onClick={() => setAdding(false)}>Cancel</button></p>
          </form>
        )}
      </section>

      {users.map((u) => (
        <Person key={u.id} u={u} me={auth.user} busy={busy} run={run} token={auth.token} />
      ))}
    </>
  );
}

function Person({ u, me, busy, run, token }) {
  const self = u.id === me.id;
  const locked = u.isMain && !self; // only the main super admin can change the main account
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState({ name: u.name, maxPhotos: u.maxPhotos, maxMB: u.maxMB, role: u.role });
  const [password, setPassword] = useState('');
  // After a save the list is loaded again. The form then shows the saved numbers, and stays open.
  useEffect(() => { setEdit({ name: u.name, maxPhotos: u.maxPhotos, maxMB: u.maxMB, role: u.role }); }, [u.name, u.maxPhotos, u.maxMB, u.role]);

  const saveEdit = (e) => {
    e.preventDefault();
    const body = { name: edit.name, maxPhotos: Number(edit.maxPhotos), maxMB: Number(edit.maxMB) };
    if (!self && edit.role !== u.role) body.role = edit.role;
    run(() => updateUser(token, u.id, body), 'Saved.');
  };
  const setStatus = (status) => run(() => updateUser(token, u.id, { status }), status === 'active' ? 'Done. They can log in now.' : 'Turned off. They are logged out and their site is hidden.');
  const reset = (e) => {
    e.preventDefault();
    run(async () => { await resetPassword(token, u.id, password); setPassword(''); }, 'The password was changed. Tell the person the new password. They are logged out everywhere.');
  };
  const del = () => {
    if (window.confirm(`Delete ${u.name} (${u.email})?\n\nThis also deletes their site and all ${u.photoCount} pictures. This cannot be undone.`)) run(() => removeUser(token, u.id), 'Deleted.');
  };

  const full = Math.min(100, Math.max(u.photoCount / Math.max(1, u.maxPhotos), u.bytes / Math.max(1, u.maxMB * MB)) * 100);

  return (
    <section className={`ad-card ad-user${u.status !== 'active' ? ' ad-dim' : ''}`}>
      <div className="ad-user-head">
        <div>
          <h2>{u.name}{self && <span className="ad-you"> (you)</span>}</h2>
          <p className="ad-hint">{u.email}</p>
          <p className="ad-badges">
            {u.role === 'superadmin' && <span className="ad-badge ad-badge-super">Super admin</span>}
            {u.isMain && <span className="ad-badge">Main account</span>}
            {u.status === 'pending' && <span className="ad-badge ad-badge-warn">Waiting for approval</span>}
            {u.status === 'disabled' && <span className="ad-badge ad-badge-off">Turned off</span>}
          </p>
        </div>
        <div className="ad-stats">
          <p>{u.photoCount} of {u.maxPhotos} pictures</p>
          <p>{mb(u.bytes)} of {u.maxMB} MB</p>
          <div className="ad-meter" aria-hidden="true"><span style={{ width: `${full}%` }} /></div>
          <p className="ad-hint">Last login: {when(u.lastLoginAt)}</p>
        </div>
      </div>

      <div className="ad-actions">
        {u.status === 'pending' && !locked && <button disabled={busy} onClick={() => setStatus('active')}>Approve</button>}
        {u.status === 'active' && !self && !locked && <button className="ad-ghost" disabled={busy} onClick={() => setStatus('disabled')}>Turn off</button>}
        {u.status === 'disabled' && !locked && <button disabled={busy} onClick={() => setStatus('active')}>Turn on</button>}
        <Link className="ad-btn ad-ghost" to={self ? '/admin' : `/admin/users/${u.id}`}>{self ? 'My site' : 'Open their site to manage'}</Link>
        {u.slug && u.status === 'active' && <a className="ad-btn ad-ghost" href={`/s/${u.slug}`} target="_blank" rel="noreferrer">View public page</a>}
        <button className="ad-ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Less' : 'More'}</button>
      </div>

      {open && (
        <div className="ad-more">
          <form onSubmit={saveEdit}>
            <label>Name<input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={60} required disabled={locked} /></label>
            <div className="ad-row">
              <label>Pictures allowed<input type="number" min="0" max="500" value={edit.maxPhotos} onChange={(e) => setEdit({ ...edit, maxPhotos: e.target.value })} disabled={locked} /></label>
              <label>Space allowed (MB)<input type="number" min="0" max="500" value={edit.maxMB} onChange={(e) => setEdit({ ...edit, maxMB: e.target.value })} disabled={locked} /></label>
              <label>Role
                <select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })} disabled={self || locked}>
                  <option value="admin">Admin</option>
                  <option value="superadmin">Super admin</option>
                </select>
              </label>
            </div>
            <p><button disabled={busy || locked}>Save</button></p>
          </form>
          {!self && !locked && (
            <>
              <form onSubmit={reset}>
                <label>Set a new password for this person
                  <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} maxLength={128} autoComplete="off" placeholder="At least 8 characters" required />
                </label>
                <p><button disabled={busy}>Change password</button></p>
              </form>
              <p><button className="ad-danger" disabled={busy} onClick={del}>Delete this person and everything of theirs</button></p>
            </>
          )}
          {locked && <p className="ad-hint">This is the main super admin account, so it is protected. Only its owner can change it.</p>}
        </div>
      )}
    </section>
  );
}
