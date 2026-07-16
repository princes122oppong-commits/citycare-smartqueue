# CityCare SmartQueue - Hospital Queue Management System

A web-based queue management system for hospitals and clinics, built with Supabase for authentication and real-time data.

## Features

- **Patient Portal**: Join queue, view queue status, book appointments, manage profile, receive notifications
- **Receptionist Dashboard**: Manage walk-in registrations, view department queues, process patients
- **Department Portal**: Doctor/Nurse queue management, appointment handling, patient flow for specific departments
- **Admin Panel**: Full system administration, user management, department configuration, reports & analytics, system settings

## Portals

| Portal | Access | Features |
|--------|--------|----------|
| Patient | `login.html` | Join queue, book appointments, view status, notifications |
| Receptionist | `receptionist-login.html` | Walk-in registration, manage active queues, patient records |
| Department | `department_staff-login.html` | Department-specific queue management, appointments, patient flow |
| Admin | `admin-login.html` | All system features, analytics, user management |

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
   - `supabase-bootstrap.sql` **(recommended)** - Complete schema, RLS policies, indexes, and queue token function
   - `supabase-rls.sql` - RLS policies only (for existing schema)

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
├── index.html                       # Landing page
├── login.html                       # Unified login page (patients)
├── patient-login.html               # Patient login (alternative)
├── receptionist-login.html          # Receptionist login
├── admin-login.html                 # Admin login
├── department_staff-login.html      # Department staff login
├── register.html                    # Patient registration
│
├── admin/                           # Admin portal
│   ├── css/
│   │   ├── admin-dashboard.css
│   │   ├── appointments.css
│   │   ├── queue.css
│   │   ├── reports.css
│   │   └── settings.css
│   ├── html/
│   │   ├── admin-dashboard.html
│   │   ├── departments.html
│   │   ├── queue.html
│   │   ├── reports.html
│   │   └── settings.html
│   └── js/
│       ├── departments.js
│       └── users.js
│
├── receptionist/                    # Receptionist portal
│   ├── css/
│   │   └── queue-management.css
│   ├── html/
│   │   ├── queue-management.html
│   │   └── walkin-registration.html
│   └── js/
│       ├── department-queue.js
│       ├── queue-management.js
│       └── walkin-registration.js
│
├── department/                      # Department portal
│   ├── dashboard.html
│   ├── appointments.html
│   ├── queue.html
│   ├── department.css
│   ├── dashboard.js
│   └── appointments.js
│
├── patients/                        # Patient portal
│   ├── css/
│   │   ├── book-appointment.css
│   │   ├── join-queue.css
│   │   └── common.css
│   ├── html/
│   │   ├── book-appointment.html
│   │   ├── join-queue.html
│   │   ├── notifications.html
│   │   ├── patients-dashboard.html
│   │   ├── profile.html
│   │   └── queue-status.html
│   └── js/
│       ├── book-appointment.js
│       ├── dashboard.js
│       ├── join-queue.js
│       ├── notifications.js
│       └── profile.js
│
├── shared/                          # Shared utilities
│   └── js/
│       ├── notifications-toast.js   # Toast notification system
│       └── utils.js                 # Common utility functions
│
├── supabase-config.js               # Supabase client (shared)
├── supabase-config.example.js         # Credential template
├── supabase-bootstrap.sql           # Full schema + RLS (recommended)
└── supabase-rls.sql                 # RLS policies only
```

### SQL Migration Files

The project includes several SQL migration files for database setup and fixes:

- `supabase-bootstrap.sql` - **Recommended**: Complete schema, RLS policies, indexes, and queue token function
- `supabase-rls.sql` - RLS policies only (for existing schema)
- `fix-appointment-rls.sql` - Appointment RLS policy fixes
- `fix-appointment-rls-department.sql` - Department-specific appointment RLS
- `fix-notifications-rls.sql` - Notifications RLS policy fixes
- `fix-patient-rls.sql` - Patient RLS policy fixes
- `fix-patient-delete-cascade.sql` - Cascade delete fixes
- `fix-rls-admin-function.sql` - Admin function RLS fixes
- `fix-performance-indexes.sql` - Performance optimization indexes
- `create-token-function.sql` - Queue token generation function
- `rename-staff-to-receptionist.sql` - Staff table rename migration
- `create-department-staff-table.sql` - Department staff table creation
- `diagnostic-sql.sql` - Diagnostic queries for troubleshooting
- `cleanup-duplicates.sql` - Removes duplicate queue tokens
- `cleanup-all-duplicates.sql` - Removes all duplicate records

## System Fixes & Maintenance

See `fixes-summary.md` for details on:
- Null department_id guards implementation
- Error handling improvements for Supabase queries
- Security audit results
- `queue_sequences` table + `generate_next_queue_token` function for atomic token generation

## Authentication Flow

1. **Patients**: Login via `login.html` or `patient-login.html` → redirected to `patients/html/patients-dashboard.html`
2. **Receptionist**: Login via `receptionist-login.html` → redirected to `receptionist/html/queue-management.html`
3. **Department Staff**: Login via `department_staff-login.html` → redirected to `department/dashboard.html`
4. **Admin**: Login via `admin-login.html` → redirected to `admin/html/admin-dashboard.html`

Each portal has its own auth guard that verifies authentication and authorization on every page load.

## Database Schema

The system uses PostgreSQL via Supabase with the following tables:

| Table | Description |
|-------|-------------|
| `departments` | Hospital departments (Cardiology, Neurology, etc.) |
| `patients` | Patient profiles |
| `receptionist` | Staff users (Doctors, Nurses, Receptionists, Administrators) |
| `users` | Admin users table |
| `appointments` | Scheduled appointments |
| `queue_entries` | Walk-in queue entries |
| `notifications` | Patient notifications |
| `settings` | System settings |
| `queue_sequences` | Atomic token counter per department |

### Key Features

- **Atomic Token Generation**: `generate_next_queue_token(department_id)` function prevents race conditions
- **ON DELETE CASCADE**: Department deletion cascades to related appointments and queue entries
- **Performance Indexes**: Pre-configured indexes on frequently queried columns

## Security Notes

- **Row Level Security**: Both SQL migration files contain comprehensive RLS policies
  - Patients can only access their own data
  - Receptionist can access their department's queue and patient records
  - Administrators have full system access
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