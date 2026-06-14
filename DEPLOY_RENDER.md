# Deploying GIDS to Render (with a free cloud MySQL)

This document describes the recommended steps to deploy the `GIDS` app to Render and connect it to a free cloud MySQL provider (PlanetScale recommended).

1) Create a cloud MySQL (PlanetScale recommended)

- Sign up at https://planetscale.com and create a new database.
- After creation, open the **Connect** tab and choose the **Standard (MySQL)** connection.
- Choose the region closest to your Render service. Copy the connection details (host, port, username, password, database).

Notes for PlanetScale:
- PlanetScale uses a `username` and a password you create (or generate). They may provide a full connection string — extract host, port (usually 3306), user, password, and database name.
- If a provider requires special SSL flags, Render can still use them by setting env vars and configuring the connection in `server.js` if needed.

2) Add environment variables to Render (do not commit secrets)

- Create a new Web Service in Render and connect it to the GitHub repo `GIDS-WEB1` (branch `main`).
- In Render service settings, set the Environment to `Node` and supply:

  - `DB_HOST` = (from provider)
  - `DB_PORT` = 3306
  - `DB_USER` = (from provider)
  - `DB_PASSWORD` = (from provider)
  - `DB_NAME` = (from provider)
  - `EMAIL_USER` = your sending email (Gmail recommended)
  - `EMAIL_PASS` = Gmail app password
  - `JWT_SECRET` = a strong secret string

3) Render service settings

- Build command: `npm install`
- Start command: `node server.js`
- Branch: `main`
- Root directory: repository root

4) Database initialization

- `server.js` will attempt to create the database and tables if permitted by the DB user. For managed providers, create the database in the provider console first and use those credentials.

5) Deploy and test

- Deploy the service from Render. Watch the build logs for errors.
- Test the site URL that Render provides:
  - Homepage loads
  - POST `/api/contact` (book consultation) works
  - POST `/api/enroll` works

6) Troubleshooting

- If you see connection errors, check:
  - Env vars are correct and available to the service
  - Provider allows connections from Render (some providers block unknown origins — use a managed DB or whitelist Render IP ranges if needed)
  - Check Render logs for stack traces

7) Security notes

- Keep `.env` out of git (already in `.gitignore`).
- Use a strong `JWT_SECRET` and a Gmail App Password for `EMAIL_PASS` if using Gmail.

If you want, I can:
- Walk you through creating the PlanetScale database now (I will provide exact clicks/values), or
- Create the Render service steps and a checklist and then guide you to add the env vars.
