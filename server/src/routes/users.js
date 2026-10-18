import { Router } from 'express';
import multer from 'multer';
import { ah, HttpError } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';
import { cleanSettings, publicSettings } from '../lib/sanitize.js';
import { cleanSlug } from '../lib/slug.js';
import { sniffImage } from '../lib/images.js';
import { isId, plain } from '../lib/validate.js';
import { MB } from '../lib/limits.js';

const TYPES = /^image\/(jpeg|png|webp|gif)$/;
const mb = (bytes) => Math.round((bytes / MB) * 10) / 10;
// File names come from the visitor's computer, so remove odd characters and keep them short.
const fileName = (name, max = 100) => String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) || 'picture';

// Everything a logged-in person does with THEIR OWN site. The address is /api/users/<id>/... where <id> is "me" or a person's id.
// A normal admin can only use their own id. The super admin can use anyone's.
export default function usersRoutes(store) {
  const router = Router();
  router.use(authenticate(store));
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Whose site is this about? Anything that is not allowed looks exactly like "does not exist".
  router.use('/:id', ah(async (req, res, next) => {
    const me = req.user;
    const wanted = req.params.id === 'me' ? me.id : req.params.id;
    if (!isId(wanted)) throw new HttpError(404, 'Not found.');
    const id = wanted.toLowerCase();
    let target = null;
    if (id === me.id) target = me;
    else if (me.role === 'superadmin') target = await store.findUserById(id);
    if (!target) throw new HttpError(404, 'Not found.');
    req.target = target;
    next();
  }));

  const usage = (target, photos) => ({
    count: photos.length,
    bytes: photos.reduce((n, p) => n + p.size, 0),
    maxPhotos: target.maxPhotos,
    maxBytes: target.maxBytes,
  });
  const photoView = (target, photos) => photos.map((p) => ({ id: p.id, name: p.name, size: p.size, url: `/api/users/${target.id}/photos/${p.id}/image` }));

  // Everything the admin page needs in one request.
  router.get('/:id/site', ah(async (req, res) => {
    const target = req.target;
    const [site, photos] = await Promise.all([store.getOrCreateSite(target.id), store.listPhotos(target.id)]);
    res.json({
      owner: { id: target.id, name: target.name, email: target.email },
      slug: site.slug,
      settings: publicSettings(site),
      hearts: site.hearts ?? 0,
      photos: photoView(target, photos),
      usage: usage(target, photos),
    });
  }));

  router.put('/:id/settings', ah(async (req, res) => {
    const body = plain(req.body);
    const changes = cleanSettings(body);
    if ('slug' in body) {
      const result = cleanSlug(body.slug);
      if (result.error) throw new HttpError(400, result.error);
      changes.slug = result.slug;
    }
    const site = await store.updateSite(req.target.id, changes);
    res.json({ slug: site.slug, settings: publicSettings(site) });
  }));

  // Pictures wait in memory, then go straight into the database.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * MB, files: 20, fields: 5, fieldSize: 1024, parts: 30 },
    fileFilter: (req, file, cb) =>
      TYPES.test(file.mimetype)
        ? cb(null, true)
        : cb(new HttpError(400, `"${fileName(file.originalname, 40)}" is not a picture. Please choose JPG, PNG, WebP or GIF files.`)),
  });
  const notTooBig = (req, res, next) => {
    if (Number(req.headers['content-length']) > 30 * MB) return next(new HttpError(413, 'That upload is too big. Please add fewer pictures at a time.'));
    next();
  };

  router.post('/:id/photos', notTooBig, upload.array('photos', 20), ah(async (req, res) => {
    const target = req.target;
    const files = req.files ?? [];
    if (!files.length) throw new HttpError(400, 'Choose at least one picture (JPG, PNG, WebP or GIF, up to 5 MB each).');

    // The name and the type a browser sends can be faked, so look at what is really inside the file.
    const checked = files.map((f) => {
      const contentType = sniffImage(f.buffer);
      if (!contentType) throw new HttpError(400, `"${fileName(f.originalname, 40)}" is not a real picture. Please choose JPG, PNG, WebP or GIF files.`);
      return { name: fileName(f.originalname), contentType, data: f.buffer };
    });

    const before = await store.listPhotos(target.id);
    const now = usage(target, before);
    const adding = checked.reduce((n, f) => n + f.data.length, 0);
    if (now.count + checked.length > target.maxPhotos) {
      const room = Math.max(0, target.maxPhotos - now.count);
      throw new HttpError(403, room
        ? `The limit is ${target.maxPhotos} pictures for this account. Only ${room} more can be added.`
        : `The limit is ${target.maxPhotos} pictures for this account, and it is full. Delete a picture first.`);
    }
    if (now.bytes + adding > target.maxBytes) {
      throw new HttpError(403, `There is not enough space. The limit is ${mb(target.maxBytes)} MB and ${mb(now.bytes)} MB is already used.`);
    }

    const ids = await store.addPhotos(target.id, checked);
    const photos = await store.listPhotos(target.id);
    const after = usage(target, photos);
    if (after.count > target.maxPhotos || after.bytes > target.maxBytes) {
      // Many uploads can arrive at the same moment and all pass the check above together.
      // So the total is checked again after saving, and this upload is taken back if the limit is passed. The limit always holds.
      await Promise.all(ids.map((id) => store.deletePhoto(target.id, id)));
      throw new HttpError(403, 'The limit for this account was reached while uploading. Please try again with fewer pictures.');
    }
    res.status(201).json({ photos: photoView(target, photos), usage: after });
  }));

  router.delete('/:id/photos/:photoId', ah(async (req, res) => {
    await store.deletePhoto(req.target.id, req.params.photoId); // deleting something that is not there is fine
    const photos = await store.listPhotos(req.target.id);
    res.json({ photos: photoView(req.target, photos), usage: usage(req.target, photos) });
  }));

  // The preview in the admin page. The page asks with its login ticket and shows the answer, because an <img> tag cannot send one.
  router.get('/:id/photos/:photoId/image', ah(async (req, res) => {
    const photo = await store.getPhoto(req.target.id, req.params.photoId);
    if (!photo) throw new HttpError(404, 'Not found.');
    res.set({
      'Content-Type': photo.contentType,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, max-age=300',
    }).send(photo.data);
  }));

  return router;
}
