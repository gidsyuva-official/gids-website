## Deploying GIDS to Render (PostgreSQL)

This project has been migrated to PostgreSQL. The server now uses the `pg` driver and will create required tables automatically when the service starts (if the DB user has the required privileges).

Recommended deployment flow on Render (using managed PostgreSQL):

1) Create a Render Managed PostgreSQL database

- In Render dashboard, go to **Databases** → **Create PostgreSQL** (choose the smallest or free tier if available).
- Pick a name (e.g., `gids-db`) and region close to your app. Create the database.
- Once created, open the DB and copy connection details: host, port (usually 5432), database, user, password.

2) Add environment variables to your Render Web Service

- Create or open your Web Service connected to the `GIDS-WEB1` repo (branch `main`).
- Set the following Environment Variables in the Render service settings:

  - `DB_HOST` = host from Render DB
  - `DB_PORT` = 5432
  - `DB_USER` = DB user
  - `DB_PASSWORD` = DB password
  - `DB_NAME` = database name
  - `EMAIL_USER` = your sending email (Gmail recommended)
  - `EMAIL_PASS` = Gmail app password (app password)
  - `JWT_SECRET` = a strong secret string

3) Render service settings

- Build command: `npm install`
- Start command: `node server.js`
- Branch: `main`
- Root directory: repository root

4) Deploy and test

- Deploy the service. Watch logs for database connection messages.
- Visit the provided service URL and test:
  - Homepage loads
  - POST `/api/contact` (book consultation)
  - POST `/api/enroll`

5) If you prefer an external provider (Aiven, Railway, AWS RDS)

- You can create a PostgreSQL instance on any provider and supply the connection details in Render env vars. Ensure network access from Render to that DB.

6) Security notes

- Keep `.env` out of git (already in `.gitignore`).
- Use a strong `JWT_SECRET` and secure email app passwords.

If you want, I can now:
- walk you through creating a Render Postgres DB and setting env vars, or
- convert the SQL in `database/schema.sql` to a Postgres-compatible file and add it to the repo.
