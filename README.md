# SmartQueue Health - Hospital Queue Management System

A web-based queue management system for hospitals and clinics, built with Supabase for authentication and real-time data.

## Features

- **Patient Portal**: Join queue, view queue status, book appointments
- **receptionist Dashboard**: Manage active queues, process walk-in registrations, view patient records
- **Admin Panel**: Full system administration, user management, department configuration, reports

## Technology Stack

- **Frontend**: HTML, CSS, JavaScript (vanilla)
- **Backend**: Supabase (PostgreSQL, Auth, Realtime)
- **Charts**: Chart.js
- **Hosting**: Any static file server (http-server, Vite, etc.)

## Setup Instructions

### 1. Prerequisites

- Node.js (for local development server)
- A Supabase project (free tier works)

### 2. Supabase Setup

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Go to your project's SQL Editor
3. Run **one** of the SQL migration files:
   - `supabase-rls.sql` **(recommended)** - Includes Row Level Security policies for production
   - `supabase-bootstrap.sql` - Basic schema setup (less restrictive)

> **Important**: `supabase-rls.sql` is the source of truth with proper RLS policies. Only use `supabase-bootstrap.sql` for initial development.

### 3. Configure Supabase Credentials

1. Copy `supabase-config.example.js` to `supabase-config.js`
2. Fill in your Supabase project URL and anon key from Settings > API

```js
const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

> **Security**: The `supabase-config.js` file contains your Supabase anon key. In production, load credentials from environment variables. The `.gitignore` already excludes `.env` files.

### 4. Run the Application

Using http-server (simple):

```bash
npm install -g http-server
http-server . -p 8080 -c-1 --cors
```

Then open http://localhost:8080 in your browser.

### 5. Default Ports

| Port | Service |
|------|---------|
| 8080 | Application (http-server) |
| 5432 | PostgreSQL (Supabase) |

## Project Structure

```
/
├── index.html              # Landing page
├── login.html              # Unified login page
├── register.html           # Patient registration
├── admin-login.html        # Admin login
├── receptionist-login.html        # receptionist login
├── supabase-config.js      # Supabase client (shared)
├── supabase-config.example.js  # Credential template
├── supabase-bootstrap.sql  # Basic schema migration
├── supabase-rls.sql        # RLS policies (recommended)
│
├── admin/                  # Admin portal
│   ├── css/
│   ├── html/               # Admin pages
│   └── js/                 # Admin scripts
│
├── receptionist/                  # receptionist portal
│   ├── css/
│   ├── html/               # receptionist pages
│   └── js/                 # receptionist scripts
│
├── patients/               # Patient portal
│   ├── css/
│   ├── html/               # Patient pages
│   └── js/                 # Patient scripts
│
└── shared/                 # Shared utilities
    └── js/
        └── utils.js        # Common utility functions
```

## Authentication Flow

1. Users login via `login.html` (patients) or `receptionist-login.html` / `admin-login.html`
2. The system determines the user's role (patient, receptionist, admin)
3. Users are redirected to their respective dashboard
4. Each portal has its own auth guard:
   - Admin pages check `ensureAdminSession()`
   - receptionist pages check `ensurereceptionistSession()`
   - Patient pages verify patient profile exists

## Security Notes

- **Row Level Security**: `supabase-rls.sql` contains comprehensive RLS policies
  - Patients can only access their own data
  - receptionist can access department-related data
  - Administrators have full access
- **XSS Prevention**: All user-generated content is HTML-escaped before rendering
- **Auth Guards**: Each portal verifies authentication and authorization on every page load
- **Credentials**: Never commit real credentials to version control

## Development

### Quick Wins

- Add loading spinners to data tables
- Implement Supabase Edge Functions for SMS/email notifications
- Add database indexes on frequently queried columns
- Enable Supabase Realtime on `queue_entries` table

### Running with Vite (recommended for development)

```bash
npm init -y
npm install vite --save-dev
npx vite
```

## Troubleshooting

- **"Supabase SDK not found"**: Ensure the Supabase CDN script is loaded before `supabase-config.js`
- **Login fails**: Check that the user exists in both Supabase Auth and the corresponding profile table (patients, receptionist, or users)
- **Blank pages**: Check browser console for errors; ensure all script dependencies are loading in order