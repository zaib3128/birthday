# Birthday website maker (MERN)

Make a birthday website for someone you love. Many people can use it: each person (an **admin**) gets their **own account, their own private pictures, their own words and their own link**. One **super admin** (the owner) can see and manage everyone.

The gift page has 5 screens, one below the other. You scroll down through them:

1. **Home** – a number rolls up to the birthday day (for example **26**), zooms into the page, and a live countdown runs to the birthday.
2. **Happy Birthday** – a ribbon of photos glides around a loop. You can drag it.
3. **Polaroids** – photos on a table. Drag and throw them. The small heart counts taps in the database.
4. **Sketchbook** – a spiral notebook. Click the pages to turn them.
5. **Space** – photos fly towards you. Move the mouse to look around, hover a photo to slow down.

> Is your site already online with one admin only? Read **UPDATE-GUIDE.md** first. Your old pictures and words are kept.

## Who can do what

| Who | What they can do |
|---|---|
| **Visitor** (no account) | Open a site if they have its link (`/s/<name>`). Tap the heart. Sign up, if the owner allows it. |
| **Admin** | Log in at `/admin`. Manage **only their own** pictures, words, date and link. Change their own password. |
| **Super admin** | Everything an admin can do, plus: see all people, approve / turn off / delete them, set how much each person may keep, set a new password for a person, open and edit anyone's site, choose who may sign up, and choose which site shows on the home address (`/`). |

The **main super admin** is the account whose email is in `SUPERADMIN_EMAIL`. Nobody can turn it off, change its role, reset its password or delete it. Not even another super admin. (But any super admin can open and edit **every** site, also the main one. Only make a person super admin if you trust them fully.)

### How the privacy works

- Every picture and every site has exactly one **owner** (an account).
- Each request that reads or changes a picture checks the owner first. If an admin asks for another person's picture, the answer is "Not found", the same as for a picture that does not exist.
- A site is public **only** through its own link. By default the link ends in random letters (like `/s/k7m2xq9pw3`) and the owner can change it. Anyone who has the link can see that site, so share it carefully.
- A person who is **turned off** or **deleted**: their site link stops working at once, and their login stops working at once.
- The super admin **can** see everything. The sign-up form says so.
- Search engines are told not to list any page (`noindex` and `robots.txt`).

## What "MERN" means here

| Letter | Tool | What it does in this project |
|---|---|---|
| **M** | **MongoDB** (a database) | Keeps the accounts, the pictures, the words, and the heart counts |
| **E** | **Express** (a web server for Node.js) | Gives the data to the website through an **API** (a set of web addresses the website calls, like `/api/home`) |
| **R** | **React** (a library for building web pages) | Draws the 5 screens, the sign-up / login forms, and the admin pages |
| **N** | **Node.js** (runs JavaScript outside the browser) | Runs the server |

## What you need first

- **Node.js 18.18 or newer** (20 or 22 is best). Check with `node -v`. Download from nodejs.org.
- **A MongoDB database.** Pick one:
  - **MongoDB Atlas** (free, online): create a free cluster at mongodb.com/atlas, make a database user, allow your IP address, and copy the "connection string". It looks like `mongodb+srv://user:password@cluster0.xxxx.mongodb.net/birthday`.
  - **MongoDB on your computer**: install MongoDB Community Server. Then the link is `mongodb://127.0.0.1:27017/birthday`.

## Run it on your computer

Open a terminal in this folder (`birthday-mern`).

**1. Install everything** (once):

```
npm run install:all
```

**2. Make your settings file.** Copy `server/.env.example` to `server/.env`:

- Windows (Command Prompt): `copy server\.env.example server\.env`
- Mac, Linux, or Git Bash: `cp server/.env.example server/.env`

Then open `server/.env` and fill it in. (A `.env` file holds secret settings. Never share it and never upload it.)

| Setting | What to put |
|---|---|
| `MONGODB_URI` | Your MongoDB link from above |
| `JWT_SECRET` | A long random text (at least 16 letters). A **JWT** is the login "ticket" the server gives after a right password. This text signs it. Make one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `SUPERADMIN_EMAIL` | **Your** email. You log in with it as the super admin. |
| `ADMIN_PASSWORD` | Your first super admin password (at least 8 characters). It is used **only the first time**, to create the account. After that, change your password inside the site, and this setting is ignored. |
| `SUPERADMIN_NAME` | Optional. The name shown on your account. |
| `DEFAULT_MAX_PHOTOS`, `DEFAULT_MAX_MB` | Optional. How much a **new** person may keep. Default: 30 pictures and 40 MB. You can change it for each person later. |
| `PORT` | Leave as `5000` |
| `CLIENT_ORIGIN` | Only if the website and the server are on two different addresses |
| `TEST_MONGODB_URI` | Only for the optional database test (see **Tests**) |

When the server runs online (on a host, or with `NODE_ENV=production`), it **refuses to start** if `JWT_SECRET` is still the example text or shorter than 16 letters. It also refuses to create the first super admin with the example password. It tells you in plain words which setting is wrong.

**3. Start it:**

```
npm run dev
```

**4. Open it:**

- The website: **http://localhost:5173**
- The admin page: **http://localhost:5173/admin**

In `dev` mode, changes to the code show up straight away. The website (port 5173) forwards its `/api` calls to the server (port 5000).

### First things to do

1. Open `/admin` and log in with `SUPERADMIN_EMAIL` and `ADMIN_PASSWORD`.
2. **My site** shows your own link (like `/s/k7m2xq9pw3`). You can change the end of it.
3. Upload pictures. You can choose many at once. Your browser makes each one smaller first (longest side 1600 pixels), so the site stays fast. Until you upload pictures, small hearts are shown instead.
4. Change the nickname (the "Sweety" in "Happy Birthday Sweety"), the message under it, the sketchbook title, the polaroid captions, the names in the space screen, and the sketchbook notes. Press **Save**, then open the site.
5. Check the birthday month, day and time zone. The countdown ends at midnight in that time zone. Pakistan time is `300` (minutes ahead of UTC).
6. Open **People** (super admin only). Choose who can sign up. The default is: new people **wait until you approve them**.

## Put it online

The simplest way is **one service** that runs the server and also serves the finished website. Hosts like Render or Railway can run it. Use these:

- **Build command:** `npm run install:all && npm run build`
- **Start command:** `npm start`
- **Environment variables** (set them in the host's settings, do not upload `.env`): `MONGODB_URI`, `JWT_SECRET`, `SUPERADMIN_EMAIL`, `ADMIN_PASSWORD`
- In MongoDB Atlas, allow the host to connect (Network Access). Many hosts need `0.0.0.0/0`.

To test the finished build on your own computer: `npm run build`, then `npm start`, then open http://localhost:5000.

**Vercel (two projects):** the **server** is one Vercel project (Root Directory `server`, with `api/index.js` and `vercel.json`) and the **website** is another (Root Directory `client`, with `vercel.json`). In the website project, set `VITE_API_URL` to the server's address. In the server project, set `CLIENT_ORIGIN` to the website's address (both without a slash at the end), plus the settings from the table above. `UPDATE-GUIDE.md` has the steps. Vercel refuses one request bigger than 4.5 MB, so the admin page sends pictures in small groups by itself.

If you host the website and the server in **two different places**: build the website with `VITE_API_URL=https://your-server-address` set, and put the website's address in the server's `CLIENT_ORIGIN` setting.

## Tests

```
npm test
```

This runs the server tests. They check sign-up, login, the lock after wrong passwords, who can see what (one admin must never reach another admin's data), uploads, limits, the super admin rules, and the start-up steps. They use a copy of the database that lives in memory, so they need no MongoDB.

To also run the same tests on the **real MongoDB code**, put a test database link in `server/.env` as `TEST_MONGODB_URI`. The database name **must contain the word `test`**, because the test deletes everything inside it:

```
TEST_MONGODB_URI=mongodb://127.0.0.1:27017/birthday_test
```

## What is where

```
birthday-mern/
├─ UPDATE-GUIDE.md           how to upgrade a site that is already online
├─ client/                   the React website
│  ├─ vercel.json            Vercel: every address opens index.html
│  ├─ public/robots.txt      tells search engines not to list the pages
│  └─ src/
│     ├─ screens/            the 5 screens (Home, Wish, Memories, Sketchbook, Space) and the Intro
│     ├─ pages/              Admin.jsx (the /admin frame), AuthForms.jsx (log in, sign up),
│     │                      Panel.jsx (My site), Users.jsx (People), SitePages.jsx (public pages)
│     ├─ Site.jsx            draws the 5 screens from one person's data
│     ├─ api.js, auth.js     every call to the server, and the saved login
│     ├─ defaults.js         the words used if the server cannot be reached
│     └─ index.css           the styling (pages/admin.css styles the admin pages)
└─ server/
   ├─ api/index.js           the Vercel "function" that runs the server
   ├─ vercel.json            Vercel: every address goes to that function
   ├─ src/
   │  ├─ index.js            starts the server
   │  ├─ app.js              sets up Express (safety headers, routes)
   │  ├─ store.js            ALL the database code lives here
   │  ├─ models/             what is saved: User, Settings (one per person), Photo, Config
   │  ├─ routes/             auth.js, site.js (public), users.js (own site), super.js (super admin)
   │  ├─ middleware/         the login check
   │  └─ lib/                start-up steps (bootstrap), passwords, tokens, limits, link names, image checks, input cleaning
   ├─ testkit/               the in-memory copy of the store, and the shared API tests
   ├─ test/                  the tests
   └─ .env.example           the settings you copy to .env
```

## The API (the web addresses the website calls)

`:id` means the word `me` or a person's id. A normal admin can only use their own. The super admin can use anyone's. For anyone else the answer is "Not found".

| Method and address | Who | What it does |
|---|---|---|
| `GET /api/health` | everyone | Says `{"ok":true}` when the server is up |
| `GET /api/home` | everyone | The site that is shown on the home address |
| `GET /api/s/:slug` | everyone | One person's site: words, picture list, heart count (`:slug` is the end of their link) |
| `GET /api/s/:slug/photos/:id/image` | everyone | One picture of that site (the browser keeps it for a year) |
| `POST /api/s/:slug/hearts` | everyone | Adds 1 to that site's heart count (max 30 per minute per visitor) |
| `GET /api/auth/config` | everyone | Who may sign up right now |
| `POST /api/auth/register` | everyone | Sign up (max 5 per hour per device) |
| `POST /api/auth/login` | everyone | Email and password in, token out |
| `GET /api/auth/me` | logged in | Checks the token is still good |
| `POST /api/auth/password` | logged in | Change your own password |
| `GET /api/users/:id/site` | owner or super admin | The link, the words, the pictures and the usage |
| `PUT /api/users/:id/settings` | owner or super admin | Save the words, the date, and the end of the link |
| `POST /api/users/:id/photos` | owner or super admin | Upload pictures (JPG, PNG, WebP or GIF, up to 5 MB each, 20 at a time) |
| `DELETE /api/users/:id/photos/:photoId` | owner or super admin | Delete a picture |
| `GET /api/users/:id/photos/:photoId/image` | owner or super admin | Preview a picture in the admin page |
| `GET /api/super/users` | super admin | All people, with usage |
| `POST /api/super/users` | super admin | Add a person |
| `PATCH /api/super/users/:id` | super admin | Change name, status (approve / turn off), role, limits |
| `POST /api/super/users/:id/password` | super admin | Set a new password for a person |
| `DELETE /api/super/users/:id` | super admin | Delete a person and everything of theirs |
| `PUT /api/super/config` | super admin | Who may sign up, and which site shows on the home address |

"Logged in" means you must send the token in the `Authorization: Bearer <token>` header. The `/admin` page does this for you.

## Good to know

- **No emails are sent.** When you approve someone, tell them yourself. If someone forgets their password, set a new one for them in **People** and tell them.
- **Login tickets** last 7 days. They stop working at once when the password is changed or reset, or when the person is turned off or deleted.
- **Too many tries.** 5 wrong passwords lock that account for 10 minutes (saved in the database, so it works everywhere). Wrong "current password" tries in **Change password** count too. This also means that someone who knows your email can lock your account for 10 minutes by typing wrong passwords on purpose. If that happens, just wait 10 minutes. Each device address is also limited: 20 login tries per 15 minutes, 5 new accounts per hour, 30 hearts per minute. On a host that runs many copies of the server (like Vercel) the device limits are counted per copy, so they are softer there.
- **Keep the server behind a host** (Render, Railway, Vercel and so on). The server trusts the visitor address that the host's proxy passes on, to count tries per device. If you ever open the server straight to the internet with no proxy in front, a visitor could fake that address and get around the per-device limits. The account lock would still work.
- **Pictures** must be JPG, PNG, WebP or GIF. The server checks the real content of the file, not only its name. A new person may keep 30 pictures and 40 MB (you can change it per person). The super admin account may keep 500 pictures and 300 MB. The limit also holds when many uploads arrive at the same moment.
- **Pictures are stored inside MongoDB.** After shrinking, a normal picture is usually about 0.2–0.5 MB. The free Atlas database has 512 MB. The **People** page shows how much is used.
- **If the server is down**, the home address still opens and shows the default words with hearts instead of pictures, so the gift never shows an error. A person's own page shows "Try again" (never someone else's words).
- **"The server is not set up yet…"** – a setting in `server/.env` (or in the host's settings) is missing or wrong. The message names it.
- **"Could not connect to MongoDB"** – the `MONGODB_URI` is wrong, MongoDB is not running, or (Atlas) your IP address is not allowed yet.
- **`npm install` may print a few "vulnerabilities" warnings.** Most are in tools that only run on your own computer while you work (the Vite dev server and esbuild). One is about parts of React Router that this site does not use (links to outside addresses, and server-side rendering). Please do not run `npm audit fix --force`, because it jumps to new major versions that can break the project.
- **Fonts** come from Google Fonts, so the first load needs internet. Without it, the page uses plain fonts but still works.
