# 123 I Like To Ski 

A web-based management system for 123 I Like To Ski @ University of Maryland, aimed to streamline ski trip registration, attendance tracking, waitlist management, and member engagement. https://123iliktoski.com/

<img width="1280" height="657" alt="weuiyhgfwef" src="https://github.com/user-attachments/assets/69ff3732-d51d-4533-9a94-935e59d61061" />


## What it does

Members can browse trips, register, join waitlists, and check in for trips — all through a simple website. Admins get a full dashboard to manage everything: trips, rosters, waitlists, strikes, prize giveaways, and announcements.

## Stack

- **Frontend** — React, React Router, Vite
- **Backend** — Node.js, Express, PostgreSQL
- **Auth** — JWT + magic link emails
- **Infra** — HTTPS, PM2, VPS

## Running locally

```bash
npm install
npm run dev         
node server/server.js
```

Set up a `.env` file with your DB credentials, JWT secret, SMTP config, and SSL cert paths. See the full setup guide in [DOCUMENTATION.md](DOCUMENTATION.md).

## First admin

Register an account, then manually set your role in the database:

```sql
UPDATE users SET role = 'admin' WHERE email = 'you@terpmail.umd.edu';
```

Then log in and go to `/admin`.
