// Every call to the server lives here.
// In development Vite forwards /api to Express. If the site and server are hosted apart, set VITE_API_URL.
const base = import.meta.env.VITE_API_URL || '';
export const asset = (url) => base + url;

const OFFLINE = 'Could not reach the server. Please check your internet and try again.';

// One helper for every call. Errors always carry a message that is fine to show to the person.
async function request(path, { method = 'GET', token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload = form;
  if (!form && body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(base + path, { method, headers, body: payload });
  } catch {
    const err = new Error(OFFLINE);
    err.network = true;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    let message = data.error;
    if (!message && res.status === 413) message = 'That upload is too big for the server. Please add fewer or smaller pictures at a time.';
    if (!message) message = res.status >= 500 ? 'The server had a problem. Please try again in a moment.' : 'Something went wrong.';
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ----- what visitors see -----
export const getHome = () => request('/api/home');
export const getSiteBySlug = (slug) => request(`/api/s/${encodeURIComponent(slug)}`);
export const sendHeart = (slug) => request(`/api/s/${encodeURIComponent(slug)}/hearts`, { method: 'POST' });

// ----- accounts -----
export const getAuthConfig = () => request('/api/auth/config');
export const register = (body) => request('/api/auth/register', { method: 'POST', body });
export const login = (body) => request('/api/auth/login', { method: 'POST', body });
export const getMe = (token) => request('/api/auth/me', { token });
export const changePassword = (token, body) => request('/api/auth/password', { method: 'POST', token, body });

// ----- one person's site. "who" is "me", or a person's id (the super admin can use any id) -----
export const getPanel = (token, who) => request(`/api/users/${who}/site`, { token });
export const saveSettings = (token, who, body) => request(`/api/users/${who}/settings`, { method: 'PUT', token, body });
export const uploadPhotos = (token, who, files) => {
  const form = new FormData();
  [...files].forEach((f) => form.append('photos', f));
  return request(`/api/users/${who}/photos`, { method: 'POST', token, form });
};
export const deletePhoto = (token, who, id) => request(`/api/users/${who}/photos/${id}`, { method: 'DELETE', token });

// A private picture cannot be put in an <img> tag directly (the tag cannot send the login ticket), so we fetch it and show the result.
export async function fetchPhotoBlob(token, url) {
  const res = await fetch(base + url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Could not load the picture.');
  return URL.createObjectURL(await res.blob());
}

// ----- super admin -----
export const listUsers = (token) => request('/api/super/users', { token });
export const createUser = (token, body) => request('/api/super/users', { method: 'POST', token, body });
export const updateUser = (token, id, body) => request(`/api/super/users/${id}`, { method: 'PATCH', token, body });
export const resetPassword = (token, id, password) => request(`/api/super/users/${id}/password`, { method: 'POST', token, body: { password } });
export const removeUser = (token, id) => request(`/api/super/users/${id}`, { method: 'DELETE', token });
export const saveConfig = (token, body) => request('/api/super/config', { method: 'PUT', token, body });
