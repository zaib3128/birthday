# Update guide: from one site to many users

This guide is for **you (the owner)**. It changes your live site on Vercel so that:

- many people can have their **own account**, with their **own private pictures and words**;
- each person gets their own site link, like `https://birthday-qwtp.vercel.app/s/their-name`;
- you are the **super admin**: you can see everyone, approve or turn off people, and set limits;
- your **current site (her birthday site) and all her photos stay exactly as they are**. They become the super admin's site and stay on the home address.

Take your time and do the steps in order. The order matters.

---

## How your site is hosted (so the steps make sense)

You have **two Vercel projects**:

| Project | Root folder | What it does | Settings it needs |
|---|---|---|---|
| **Server** | `server` | Login, pictures, the database. Files: `server/api/index.js` and `server/vercel.json`. | `MONGODB_URI`, `JWT_SECRET`, `SUPERADMIN_EMAIL`, `ADMIN_PASSWORD`, `CLIENT_ORIGIN` |
| **Website** | `client` | The pages people see, and `/admin`. File: `client/vercel.json`. | `VITE_API_URL` |

Your own Vercel files (`server/api/index.js`, `server/vercel.json` and `client/vercel.json`) are **already inside this zip, exactly as you sent them to me**. So when you replace the folders, you do not lose them. If your real files are different from what you sent me, keep yours.

## Words used in this guide

- **Admin**: a normal person with an account. They manage only their own site.
- **Super admin**: you. You can see and manage everyone.
- **Environment variable**: a secret setting that you type into Vercel (Project → Settings → Environment Variables). The code reads it. It is never inside the code.
- **Slug**: the last part of a site link (`zara-birthday` in `/s/zara-birthday`).

---

## Step 1: Make a strong `JWT_SECRET`

`JWT_SECRET` signs the login "tickets". Anyone who knows it can pretend to be anyone, so it must be long and random. The new server **refuses to start online** if it is still `change-me-to-a-long-random-text` or shorter than 16 letters.

On your computer, in a terminal, run:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the long text it prints.

## Step 2: Set the variables in Vercel (BEFORE you upload the new code)

Open the **Server** project on Vercel → **Settings → Environment Variables**. Check or add these:

| Name | What to put | Notes |
|---|---|---|
| `MONGODB_URI` | your Atlas link | **Keep the one you already have.** The same database is used. |
| `JWT_SECRET` | the long text from Step 1 | **Replace the old value.** This logs everyone out once, which is fine. |
| `SUPERADMIN_EMAIL` | **your** email, for example `you@gmail.com` | **New.** You will log in with it. |
| `ADMIN_PASSWORD` | a strong password | **Keep it, or change it.** It becomes your **first** super admin password. After the first start it is not used any more (you can change your password inside the site). It must be at least 8 characters and must not be `choose-a-strong-password`. |
| `CLIENT_ORIGIN` | your website address, for example `https://birthday-qwtp.vercel.app` | **Keep it.** No slash at the end. It must be exactly the address of your website, or the browser blocks the calls to the server. |
| `SUPERADMIN_NAME` | your name (optional) | Shown on your account card. |

Optional: `DEFAULT_MAX_PHOTOS` (default 30) and `DEFAULT_MAX_MB` (default 40). This is how much a **new** person may keep. You can change it for each person later.

In the **Website** project nothing changes. `VITE_API_URL` must stay the address of your server project (no slash at the end).

Save. Do **not** redeploy yet.

## Step 3: Replace the code

1. Replace the **`server`** and **`client`** folders of your project with the new ones from this zip (and `README.md`, `UPDATE-GUIDE.md`).
2. Upload (push) to GitHub. Vercel builds **both projects** by itself. (If your server and your website are in two different GitHub repositories, push the `server` folder to the server one and the `client` folder to the website one.)
3. Wait until **both** projects say **Ready** (Vercel → Deployments).

While Vercel builds (a minute or two) her page can show the default words for a moment. Her photos are not touched. It fixes itself when both projects are Ready.

## Step 4: First start (what happens by itself)

The first request to the new server does these things, once:

1. It checks the settings. If something is missing, the site answers with a plain message such as *"The server is not set up yet. SUPERADMIN_EMAIL is missing…"* (you can see it on the `/admin` page).
2. It creates your **super admin account** from `SUPERADMIN_EMAIL` and `ADMIN_PASSWORD`.
3. It moves your old pictures and words to your super admin account. Nothing is copied or deleted; each picture just gets an owner.
4. It keeps your site on the home address (`/`).

## Step 5: Log in and look around

1. Open `https://birthday-qwtp.vercel.app/admin`.
2. Log in with `SUPERADMIN_EMAIL` and `ADMIN_PASSWORD`.
3. **My site** shows your old words and photos. Your site now also has its own link, like `/s/k7m2xq9pw3`. You can change the end of the link.
4. Press **Change password** and set a password only you know.
5. Open **People**. This is the super admin page.

## Step 6: Test the privacy yourself (5 minutes)

1. In a **private/incognito window**, open `/admin` and **sign up** with a second email.
2. In your normal window (super admin) open **People**. You will see the new person with *Waiting for approval*. Press **Approve**.
3. In the incognito window, log in, upload one picture, and copy that person's link.
4. Open that link in a third window. You should see **only that person's picture**. Your own site, at `/`, must **not** show it.
5. Your own site and theirs are completely separate. The new person cannot see anything of yours, and cannot open `/admin/users`.

## What you can do in **People**

- **Who can sign up?**
  - *New people wait until I approve them* (recommended, this is the default).
  - *Anyone can sign up and start at once* (strangers may fill your 512 MB database, so only use this for a short time).
  - *Nobody can sign up* (you add people yourself with **Add a person**).
- **Site shown on the home address**: choose which person's site is shown at `/`. It starts as your own.
- On each person's card:
  - **Approve**, **Turn off** and **Turn on**. When you turn someone off they are logged out at once and their site link stops working. Their data stays.
  - **Open their site to manage**: you see their pictures and words and can delete or edit them.
  - **More**: set how many pictures and how many MB they may keep, change their name or role, set a **new password** (there is no "forgot password" email, so people who forget it ask you), or **delete** them with everything of theirs.
- The **main super admin** (the email in `SUPERADMIN_EMAIL`) is protected: nobody, not even another super admin you add later, can turn it off, change its role, reset its password or delete it. (Another super admin can still open and edit the pictures and words of **every** site, also yours. So only make a person super admin if you trust them fully.)

## Good to know

- **You can see everything.** The super admin can open anyone's site. The sign-up form tells people this. Please be fair with it.
- **No email is sent** by the site. When you approve someone, tell them yourself. When someone forgets their password, set a new one for them and tell them.
- **Space**: the free Atlas database holds 512 MB. Pictures are made smaller in the browser before upload (about 0.2–0.5 MB each), so it holds a lot. The People page shows how much is used.
- **Vercel limit**: Vercel refuses one request bigger than 4.5 MB, so the page uploads pictures in small groups by itself.
- **Rate limits** (too many tries) are kept in the memory of each server copy. On Vercel there can be several copies, so the limits are softer there. The **account lock** (5 wrong passwords → 10 minutes) is saved in the database, so it works everywhere.

## If something goes wrong

| What you see | What to do |
|---|---|
| The site shows the default words, not her words | The server is not answering. Open `<your server address>/api/health`. If it says `{"ok":true}`, open `/admin` on the website and read the red message. Also check that `VITE_API_URL` (Website project) is the server address, and `CLIENT_ORIGIN` (Server project) is exactly the website address. |
| `/admin` says *"The server is not set up yet…"* | A variable from Step 2 (Server project) is missing or wrong. The message names it. Fix it, then **redeploy** the Server project (Deployments → the latest one → Redeploy). Vercel reads variables only when it deploys. |
| *"…could not connect to the database"* | In MongoDB Atlas → Network Access, allow `0.0.0.0/0`. Check `MONGODB_URI`. |
| The login page says *"Could not reach the server"* | `VITE_API_URL` (Website project) must be the server address, and `CLIENT_ORIGIN` (Server project) must be the website address. Both without a slash at the end. After you change `VITE_API_URL`, redeploy the Website project (it is read when the website is built). |
| Opening `/s/anything` gives a Vercel 404 page | `client/vercel.json` must send every address to `index.html`. It is in this zip. Check that the Website project really uses the `client` folder as its Root Directory. |
| You cannot log in as super admin | Use exactly `SUPERADMIN_EMAIL` and the `ADMIN_PASSWORD` that was set **at the first start**. If you changed `ADMIN_PASSWORD` later, it is ignored. If you forgot the password, in Atlas open the `users` collection and delete your super admin document. On the next start the account is created again from the variables. Nothing else is lost. |
| You want to go back to the old version | Possible, but only **before** other people sign up. The old code shows **all** pictures in the database on one site, so after others have uploaded pictures, going back would show their pictures on your site. Delete the other people first. |

If anything still does not work, send me the exact message you see, and what the two Vercel projects show under Deployments.
