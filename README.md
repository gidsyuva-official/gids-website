# Global India Digital Solution — Website

## Files
- `index.html` — All pages (Login, Signup, Dashboard, Training, Services, Who We Are)
- `style.css` — Complete stylesheet
- `app.js` — Frontend JavaScript
- `server.js` — Node.js backend (Express + MySQL)
- `database/schema.sql` — MySQL tables



---

## How to Run (with Database)

### Step 1 — Install MySQL
Install **MySQL** or **XAMPP** (with MySQL started).

### Step 2 — Create Database (optional — server auto-creates)
Open **MySQL Workbench** or command line and run:

```sql
source database/schema.sql
```

Or the server will create tables automatically on first start.

### Step 3 — Configure `.env`
Copy `.env.example` to `.env` and set your MySQL password:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=gids_database
PORT=3000
```

### Step 4 — Install & Start Server

```bash
npm install
npm start
```

Open in browser: **http://localhost:3000**

> Important: Use `http://localhost:3000` — do NOT open `index.html` directly. Forms need the backend server.

---

## Database Name

**`gids_database`**

## Tables

| Table | Purpose |
|-------|---------|
| `consultations` | Book a Consultation / Send Message form |
| `enroll` | Enroll Now / Enroll buttons (saves exact course/skill name) |

### View Data in MySQL

**Option 1 — MySQL Workbench**
1. Connect to localhost
2. Open `gids_database`
3. Run:
```sql
SELECT * FROM consultations ORDER BY created_at DESC;
SELECT * FROM enroll ORDER BY created_at DESC;
```

**Option 2 — Command Line**
```bash
mysql -u root -p
USE gids_database;
SELECT * FROM consultations;
SELECT * FROM enroll;
```

---

## API Endpoints

- `POST /api/contact` → `{ name, email, phone, service, message }`
- `POST /api/enroll` → `{ name, phone, email, course, mode }`

The `course` field saves the **exact card name** clicked (e.g. "NEET Coaching", "Digital Marketing").

## Contact
+91 63 74 66 94 86 | web.gibs.com  
169/117B, Bhavani Main Road, Thalavaipettai, Erode-638 312
