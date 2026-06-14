# Global India Digital Solution — Website

## Files
- `index.html` — All pages (Login, Signup, Dashboard, Training, Services, Who We Are)
- `style.css` — Complete stylesheet
- `app.js` — Frontend JavaScript
- `server.js` — Node.js backend (Express + PostgreSQL)
- `database/schema.sql` — PostgreSQL schema file

## Login Credentials
- Username: `gobi`
- Password: `5050`

---

## How to Run (with PostgreSQL)

### Step 1 — Install PostgreSQL
Install **PostgreSQL** on Windows and keep it running.
If `psql` is not on PATH, use the full path: `C:\Program Files\PostgreSQL\18\bin\psql.exe`.

### Step 2 — Create the database and user
Use PowerShell and a superuser account (usually `postgres`):

```powershell
$env:PGPASSWORD='your_postgres_password'
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -U postgres -h localhost -c "CREATE DATABASE gids_database;"
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -U postgres -h localhost -c "CREATE USER gids_user WITH PASSWORD 'YourStrongPassword!';"
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -U postgres -h localhost -c "GRANT ALL PRIVILEGES ON DATABASE gids_database TO gids_user;"
Remove-Item Env:\PGPASSWORD
```

> If the database already exists, skip the first command.

### Step 3 — Create tables (optional)
The server auto-creates tables when started, but you can also run the schema manually:

```powershell
$env:PGPASSWORD='your_postgres_password'
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -U postgres -h localhost -d gids_database -f .\database\schema.sql
Remove-Item Env:\PGPASSWORD
```

### Step 4 — Configure `.env`
Create `.env` with PostgreSQL settings:

```
DB_HOST=localhost
DB_PORT=5432
DB_USER=gids_user
DB_PASSWORD=YourStrongPassword!
DB_NAME=gids_database
PORT=3000
EMAIL_USER=yourgmail@gmail.com
EMAIL_PASS=your_gmail_app_password
BASE_URL=https://your-render-service.onrender.com
JWT_SECRET=some_secret_value
VERIFY_LINK_EXPIRES_MINUTES=15
```

### Step 5 — Install & Start Server

```powershell
npm install
npm start
```

Open in browser: **http://localhost:3000** (local)

For Render deployment:

- Set `BASE_URL` to your Render service URL (e.g. `https://my-app.onrender.com`).
- Render often blocks SMTP port 587; use Gmail SSL on port `465` and set `EMAIL_USER` and `EMAIL_PASS` (app password) in Render environment variables.

---

## Database Name

**`gids_database`**

## Tables

| Table | Purpose |
|-------|---------|
| `consultations` | Book a Consultation / Send Message form |
| `enroll` | Enroll Now / course enrollment entries |
| `reviews_table` | Reviews / Testimonials data |
| `pending_users` | Signup users waiting for verification |
| `users` | Verified users saved after email verification |

## Signup and verification flow

1. User submits the signup form on `index.html`.
2. Backend `POST /api/signup` saves the user in `pending_users` with a verification token.
3. Verification email is sent to the user with a link like `http://localhost:3000/verify/<token>`.
4. When the user opens the link, `GET /verify/:token` moves the record from `pending_users` into `users`.
5. If verification succeeds, the user is redirected to the dashboard and stored in localStorage/sessionStorage.

If verification fails or the link expires, the pending record is removed and the user must sign up again.

## Confirming data in PostgreSQL

### Option 1 — Command line (`psql`)

```powershell
$env:PGPASSWORD='YourStrongPassword!'
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -U gids_user -h localhost -d gids_database
```

Then run:

```sql
\dt
SELECT * FROM consultations ORDER BY created_at DESC;
SELECT * FROM enroll ORDER BY created_at DESC;
SELECT * FROM pending_users ORDER BY created_at DESC;
SELECT * FROM users ORDER BY created_at DESC;
```

### Option 2 — GUI tools

For PostgreSQL, use one of these instead of MySQL Workbench:
- **pgAdmin** (official PostgreSQL GUI)
- **DBeaver**
- **TablePlus**
- **DataGrip**

These tools let you connect to `localhost:5432` and browse the `gids_database` tables.

> Note: You do not need a separate MySQL Workbench application. PostgreSQL data is accessed with `psql` or a PostgreSQL GUI.

---

## API Endpoints

- `POST /api/contact` → `{ name, email, phone, service, message }`
- `POST /api/enroll` → `{ name, phone, email, course, mode }`
- `POST /api/signup` → signup form data + verification email
- `GET /verify/:token` → email verification link
- `POST /api/login` → login with verified user credentials

## Notes

- The dashboard `book consultation` and `enroll` flows already write to PostgreSQL.
- The backend now uses PostgreSQL, not MySQL.
- Use PowerShell for local PostgreSQL commands if you prefer to avoid GUI tools.

## Contact
+91 63 74 66 94 86 | web.gibs.com  
169/117B, Bhavani Main Road, Thalavaipettai, Erode-638 312
