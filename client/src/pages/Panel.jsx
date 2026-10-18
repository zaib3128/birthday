import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPanel, saveSettings, uploadPhotos, deletePhoto, fetchPhotoBlob, changePassword } from '../api.js';
import { mergeSettings } from '../defaults.js';
import { monthName } from '../lib/countdown.js';
import { shrinkImage } from '../lib/shrink.js';

const MB = 1024 * 1024;
const BATCH_BYTES = 3.5 * MB; // hosts like Vercel refuse a request bigger than 4.5 MB, so pictures go up in small groups
const BATCH_FILES = 10;
const mb = (bytes) => String(Math.round((bytes / MB) * 10) / 10);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const asText = (list) => (list || []).join('\n');
// The lists are edited as text, one item per line.
const toForm = (settings) => {
  const s = mergeSettings(settings);
  return { ...s, polaroidCaptions: asText(s.polaroidCaptions), spaceNames: asText(s.spaceNames), bookNotes: asText(s.bookNotes) };
};

// Splits the pictures into groups that are small enough to send in one request.
function groups(files) {
  const out = [];
  let current = [], size = 0;
  for (const f of files) {
    if (current.length && (size + f.size > BATCH_BYTES || current.length >= BATCH_FILES)) { out.push(current); current = []; size = 0; }
    current.push(f);
    size += f.size;
  }
  if (current.length) out.push(current);
  return out;
}

// The previews load a few at a time, so the server is not asked for 30 pictures in the same moment.
const waiting = [];
let running = 0;
function pump() {
  while (running < 4 && waiting.length) {
    const { job, resolve, reject } = waiting.shift();
    running += 1;
    job().then(resolve, reject).finally(() => { running -= 1; pump(); });
  }
}
const schedule = (job) => new Promise((resolve, reject) => { waiting.push({ job, resolve, reject }); pump(); });

function Thumb({ tokenRef, photo, onDelete, disabled }) {
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true, made = '';
    schedule(() => fetchPhotoBlob(tokenRef.current, photo.url))
      .then((url) => { if (alive) { made = url; setSrc(url); } else URL.revokeObjectURL(url); })
      .catch(() => alive && setFailed(true));
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [photo.url, tokenRef]);
  return (
    <div className="ad-photo">
      {src ? <img src={src} alt={photo.name || ''} /> : <span className="ad-ph">{failed ? '?' : '…'}</span>}
      <button disabled={disabled} onClick={onDelete}>Delete</button>
    </div>
  );
}

// "My site": the link, the pictures, the words. The super admin also uses it (with who = a person's id) to look after other people's sites.
export default function Panel({ who, auth }) {
  const isMe = who === 'me';
  const tokenRef = useRef(auth.token);
  tokenRef.current = auth.token;

  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [slug, setSlug] = useState('');
  const [missing, setMissing] = useState(false);
  const [msg, setMsg] = useState({ text: '', bad: false });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [copied, setCopied] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '' });

  const load = useCallback(async () => {
    const d = await getPanel(tokenRef.current, who);
    setData(d);
    setSlug(d.slug);
    setForm((f) => f || toForm(d.settings));
    return d;
  }, [who]);

  useEffect(() => {
    let alive = true;
    setData(null); setForm(null); setMissing(false);
    load().catch((err) => {
      if (!alive) return;
      if (err.status === 401) auth.logout();
      else if (err.status === 404) setMissing(true);
      else setMsg({ text: err.message, bad: true });
    });
    return () => { alive = false; };
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  // Runs an action, shows the result, and logs out if the login ticket is no longer good.
  const run = async (action, done, { reload = false } = {}) => {
    setBusy(true); setMsg({ text: '', bad: false });
    let ok = false;
    try {
      await action();
      ok = true;
    } catch (err) {
      if (err.status === 401) return auth.logout();
      setMsg({ text: err.message, bad: true });
    } finally {
      if (reload) await load().catch(() => {}); // the list is refreshed first, so the "done" message never shows before the new list
      if (ok) setMsg({ text: done, bad: false });
      setBusy(false); setProgress('');
    }
  };

  const upload = (e) => {
    const input = e.target, files = [...input.files];
    if (!files.length) return;
    const { count, maxPhotos } = data.usage;
    const room = maxPhotos - count;
    if (files.length > room) {
      input.value = '';
      return setMsg({
        text: room > 0 ? `You can add only ${plural(room, 'more picture')} (the limit is ${maxPhotos}). Please choose fewer.` : `The limit of ${maxPhotos} pictures is reached. Delete a picture first.`,
        bad: true,
      });
    }
    run(async () => {
      const small = [];
      for (let i = 0; i < files.length; i++) {
        setProgress(`Making picture ${i + 1} of ${files.length} smaller…`); // one at a time, so a big batch does not fill the memory
        small.push(await shrinkImage(files[i]));
      }
      const parts = groups(small);
      let done = 0;
      for (const part of parts) {
        setProgress(`Uploading ${done + 1}–${done + part.length} of ${small.length}…`);
        await uploadPhotos(tokenRef.current, who, part);
        done += part.length;
      }
      input.value = '';
    }, `${plural(files.length, 'picture')} uploaded.`, { reload: true });
  };

  const remove = (id) => window.confirm('Delete this picture? This cannot be undone.') && run(async () => { await deletePhoto(tokenRef.current, who, id); }, 'Picture deleted.', { reload: true });

  const save = (e) => {
    e.preventDefault();
    run(async () => {
      const res = await saveSettings(tokenRef.current, who, form);
      setForm(toForm(res.settings));
    }, 'Saved. Open the site to see it.');
  };

  const saveSlug = (e) => {
    e.preventDefault();
    run(async () => {
      const res = await saveSettings(tokenRef.current, who, { slug });
      setData((d) => ({ ...d, slug: res.slug }));
      setSlug(res.slug);
    }, 'The link was changed. The old link no longer works.');
  };

  const savePassword = (e) => {
    e.preventDefault();
    run(async () => {
      const res = await changePassword(tokenRef.current, { current: pw.current, next: pw.next });
      auth.signIn(res.token, auth.user); // the old tickets stopped working, this device gets a new one
      setPw({ current: '', next: '' });
    }, 'Password changed. On your other devices you will need to log in again.');
  };

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const link = data ? `${window.location.origin}/s/${data.slug}` : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); } catch { document.getElementById('ad-link')?.select(); document.execCommand?.('copy'); }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (missing) {
    return (
      <section className="ad-card">
        <h2>Not found</h2>
        <p>This person was not found.</p>
        <p><Link className="ad-btn ad-ghost" to="/admin/users">Back to all people</Link></p>
      </section>
    );
  }
  if (!form || !data) return <p>{msg.text || 'Loading…'}</p>;

  const u = data.usage;
  const fill = Math.min(100, Math.max(u.count / Math.max(1, u.maxPhotos), u.bytes / Math.max(1, u.maxBytes)) * 100);

  return (
    <>
      {!isMe && (
        <p className="ad-back"><Link to="/admin/users">← All people</Link> · You are looking after the site of <strong>{data.owner.name}</strong> ({data.owner.email}).</p>
      )}
      {busy && <p className="ad-msg" role="status">{progress || 'Working…'}</p>}
      {msg.text && <p className={`ad-msg${msg.bad ? ' ad-err' : ''}`} role={msg.bad ? 'alert' : 'status'}>{msg.text}</p>}

      <section className="ad-card">
        <h2>{isMe ? 'Your site link' : 'Site link'}</h2>
        <p className="ad-hint">Send this link to the person it is for. Anyone who has the link can open the site, so share it carefully. Your pictures are never shown anywhere else.</p>
        <div className="ad-linkbox">
          <input id="ad-link" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Site link" />
          <button type="button" onClick={copy}>{copied ? 'Copied!' : 'Copy'}</button>
          <a className="ad-btn ad-ghost" href={link} target="_blank" rel="noreferrer">Open</a>
        </div>
        <form className="ad-slug" onSubmit={saveSlug}>
          <label>Change the end of the link (3–40 letters, numbers or dashes)
            <span className="ad-prefix"><span>/s/</span><input value={slug} onChange={(e) => setSlug(e.target.value)} maxLength={40} autoCapitalize="none" spellCheck="false" /></span>
          </label>
          <button disabled={busy || slug.trim() === data.slug}>Change link</button>
        </form>
        <p className="ad-hint">If you change it, the old link stops working. The small heart has been tapped {data.hearts} times.</p>
      </section>

      <section className="ad-card">
        <h2>Pictures ({u.count})</h2>
        <div className="ad-meter" aria-hidden="true"><span style={{ width: `${fill}%` }} /></div>
        <p className="ad-hint">{u.count} of {u.maxPhotos} pictures used · {mb(u.bytes)} of {mb(u.maxBytes)} MB used</p>
        <p className="ad-hint">These pictures appear on every screen of the site. They are made smaller before uploading, so the site stays fast. With no pictures, hearts are shown.</p>
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={upload} disabled={busy} aria-label="Add pictures" />
        <div className="ad-photos">
          {data.photos.map((p) => <Thumb key={p.id} tokenRef={tokenRef} photo={p} disabled={busy} onDelete={() => remove(p.id)} />)}
        </div>
      </section>

      <form className="ad-card" onSubmit={save}>
        <h2>Words and date</h2>
        <label>Name or nickname (on "Happy Birthday ...")<input value={form.nickname} onChange={set('nickname')} maxLength={40} /></label>
        <label>Message under it<input value={form.tagline} onChange={set('tagline')} maxLength={200} /></label>
        <label>Sketchbook title (up to 12 letters)<input value={form.bookTitle} onChange={set('bookTitle')} maxLength={12} /></label>
        <div className="ad-row">
          <label>Birthday month
            <select value={form.birthdayMonth} onChange={set('birthdayMonth')}>
              {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthName(i + 1)}</option>)}
            </select>
          </label>
          <label>Birthday day<input type="number" min="1" max="31" value={form.birthdayDay} onChange={set('birthdayDay')} /></label>
          <label>Time zone (minutes ahead of UTC)<input type="number" value={form.tzOffsetMinutes} onChange={set('tzOffsetMinutes')} /></label>
        </div>
        <p className="ad-hint">Pakistan time is 300. The countdown ends at midnight in this time zone.</p>
        <label>Polaroid captions (one per line, up to 9)<textarea value={form.polaroidCaptions} onChange={set('polaroidCaptions')} /></label>
        <label>Names in the space screen (one per line, up to 14)<textarea value={form.spaceNames} onChange={set('spaceNames')} /></label>
        <label>Sketchbook notes (one per line, up to 8)<textarea value={form.bookNotes} onChange={set('bookNotes')} /></label>
        <p><button disabled={busy}>Save words and date</button></p>
      </form>

      {isMe && (
        <form className="ad-card" onSubmit={savePassword}>
          <h2>Change password</h2>
          <label>Your current password<input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" required /></label>
          <label>New password (at least 8 characters)<input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" minLength={8} maxLength={128} required /></label>
          <p><button disabled={busy}>Change password</button></p>
        </form>
      )}
    </>
  );
}
