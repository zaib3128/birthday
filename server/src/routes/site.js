import { Router } from 'express';
import { ah, HttpError } from '../lib/errors.js';
import { limiter } from '../lib/limiter.js';
import { publicSettings } from '../lib/sanitize.js';

const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const notFound = () => new HttpError(404, 'This page does not exist.');

// What every visitor can use. A visitor only ever sees a site through its public address, never through an account.
export default function siteRoutes(store, { limits }) {
  const router = Router();
  const heartLimit = limiter(limits.hearts, 'Too many hearts. Try again in a minute.');

  // Only what visitors are allowed to see. The owner's id and email are never in here.
  const view = (site, photos) => ({
    slug: site.slug,
    settings: publicSettings(site),
    photos: photos.map((p) => ({ id: p.id, url: `/api/s/${site.slug}/photos/${p.id}/image` })),
    hearts: site.hearts ?? 0,
  });

  const findSite = async (slug) => {
    if (typeof slug !== 'string' || !SLUG.test(slug)) throw notFound();
    const site = await store.findPublicSiteBySlug(slug);
    if (!site) throw notFound();
    return site;
  };

  // The site shown on the home address (the super admin chooses which one).
  router.get('/home', ah(async (req, res) => {
    const site = await store.findHomeSite();
    if (!site) throw notFound();
    res.set('Cache-Control', 'no-cache').json(view(site, await store.listPhotos(site.owner)));
  }));

  router.get('/s/:slug', ah(async (req, res) => {
    const site = await findSite(req.params.slug);
    res.set('Cache-Control', 'no-cache').json(view(site, await store.listPhotos(site.owner)));
  }));

  // One picture. It is found together with the owner of THIS site, so a picture id from another site never works here.
  router.get('/s/:slug/photos/:id/image', ah(async (req, res) => {
    const site = await findSite(req.params.slug);
    const photo = await store.getPhoto(site.owner, req.params.id);
    if (!photo) throw notFound();
    res.set({
      'Content-Type': photo.contentType,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'public, max-age=31536000, immutable', // a picture never changes, so the browser can keep it for a year
    }).send(photo.data);
  }));

  // The small heart on the polaroid screen.
  router.post('/s/:slug/hearts', heartLimit, ah(async (req, res) => {
    const site = await findSite(req.params.slug);
    const hearts = await store.addHeart(site.owner);
    if (hearts === null) throw notFound();
    res.json({ hearts });
  }));

  return router;
}
