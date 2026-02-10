# 123 I Like To Ski - Club Management System

A comprehensive web-based management system for **123 I Like To Ski**, aimed to streamline ski trip registration, attendance tracking, waitlist management, and member engagement.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Database Schema](#database-schema)
- [API Documentation](#api-documentation)
- [User Roles](#user-roles)
- [Key Workflows](#key-workflows)
- [Development](#development)

---

## Overview

The 123 I Like To Ski Club Management System is a full-stack web application that provides:

- Public-facing features for members to browse trips, register, and manage their participation
- Admin dashboard for club exec to manage trips, members, and attendance.
- (Soon to be) Automated systems for waitlist management, check-ins, and notifications

---

## Features

### For Members

#### Trip Registration
- Browse upcoming ski trips with detailed information (date, location, price, capacity)
- Register for trips with custom forms (equipment rental, skill level, emergency contact)
- Join waitlist when trips are full
- Automatic promotion from waitlist when spots open up
- Receive email confirmations and notifications

#### Magic Link Authentication
- Passwordless login via email
- Secure JWT-based session management
- UMD email validation (@umd.edu, @terpmail.umd.edu)
- Optional external email support (configurable by admins)

#### Trip Check-ins
- **2-Day Trip Check-ins**: Confirm attendance 24 hours before multi-day trips
- **Bus Attendance**: QR code-based check-in system for tracking bus riders
- Automatic deadline tracking and reminder emails

#### Account Management
- View all registered trips and waitlist positions
- Cancel registrations with waitlist auto-promotion
- Track strike history (no-show penalties)
- Update registration details

### For ADmins

#### Trip Management
- Create, edit, and delete trips
- Set capacity limits, pricing, and trip details
- Upload trip-specific waivers (PDF)
- Configure custom registration questions per trip
- Export trip rosters to Excel
- Can mark trips as requiring check-ins (2-day logic)

#### Registration Management
- View all registrations per trip
- Manually add/remove participants
- Promote/demote users to/from waitlist
- Reorder waitlist priorities
- Award prizes (rental tickets, lift tickets)
- View filled waivers and registration details

#### Waitlist System
- Automatic waitlist creation when trips reach capacity
- Manual and automatic promotion options
- Time-limited check-in deadlines for promoted users
- Configurable promotion notifications via email
- Reorderable waitlist positions

#### Strike System
- Track member no-shows and late cancellations
- Add/remove/clear strikes
- View strike history per member
- Configurable strike thresholds

#### Attendance Tracking
- Create QR code-based attendance sessions
- Real-time attendance tracking
- Export attendance records
- Can send automated attendance confirmation emails, however, probably will delete this
- Delete old attendance sessions

#### Analytics Dashboard
- Trip statistics (total trips, upcoming, completed)
- Member statistics (total members, registrations, attendance rate)
- Revenue tracking
- Recent activity logs
- Activity timeline visualization with charts

#### Announcements
- Create, edit, and delete announcements
- Pin announcements to homepage
- Activate/pause announcements
- Automatic dismissal tracking per user

#### User Management
- View all members and registration history
- Manage admin privileges
- Add/remove administrators
- View user strike counts

#### Settings
- Toggle external email registration
- Enable/disable trip safety information requirement
- Configure system-wide preferences

#### PDF Management
- Upload general information PDFs
- Delete outdated PDFs
- Serve PDFs via public URL (need to change)

#### Giveaway System
- Random prize drawing for lift tickets and equipment rentals
- Configurable prize quantities
- Award tracking (prevent duplicate wins)
- There is no automatic winner notification yet :c

---

## Technology Stack

### Frontend
- **React** - UI framework
- **React Router** - Client-side routing
- **Vite 5** - Build tool and dev server

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **PostgreSQL** - Relational database
- **Nodemailer** - Email delivery
- **JWT** - Authentication tokens
- **Multer** - File upload handling
- **HTTPS** - SSL/TLS encryption

### Infrastructure
- **Brevo (Sendinblue)** - SMTP email service
- **Let's Encrypt** - TLS certs
- **PM2** - Keeps the process alive

---

## Project Structure

```
123iliketoski/v2/public/
│
├── server/                      # Backend (Node.js/Express)
│   ├── server.js               # Main server entry point
│   ├── config/
│   │   └── index.js           # Database, SMTP, JWT, SSL config
│   ├── middleware/
│   │   ├── auth.js            # Authentication middleware
│   │   ├── multer.js          # File upload configs
│   │   └── rateLimits.js      # Rate limiting
│   ├── routes/
│   │   ├── auth.js            # Authentication routes
│   │   ├── trips.js           # Public trip routes
│   │   ├── registrations.js   # Registration management
│   │   ├── questions.js       # Custom questions
│   │   ├── announcements.js   # Announcements
│   │   ├── checkin.js         # 2-day trip check-ins
│   │   ├── waitlist.js        # Waitlist management
│   │   ├── attendance.js      # Bus attendance
│   │   └── admin/             # Admin-only routes
│   │       ├── trips.js       # Trip CRUD
│   │       ├── users.js       # User management
│   │       ├── admins.js      # Admin management
│   │       ├── pdf.js         # PDF uploads
│   │       ├── settings.js    # Settings
│   │       ├── dashboard.js   # Analytics
│   │       ├── attendance.js  # Attendance sessions
│   │       └── registrations.js # Registration details
│   ├── utils/
│   │   ├── email.js           # Email transporter
│   │   ├── helpers.js         # JWT, email validation
│   │   └── logger.js          # Activity logging
│   └── migrations/
│       └── index.js           # Database migrations
│
├── src/                        # Frontend (React)
│   ├── main.jsx               # App entry point
│   ├── App.jsx                # Route configuration
│   ├── index.css              # Global styles
│   ├── pages/
│   │   ├── Home.jsx           # Homepage with trip listings
│   │   ├── Trip.jsx           # Trip detail & registration
│   │   ├── CheckIn.jsx        # 2-day trip check-in page
│   │   ├── Admin.jsx          # Admin dashboard
│   │   ├── AboutUs.jsx        # About page
│   │   ├── FAQs.jsx           # FAQ page
│   │   └── Information.jsx    # Information/resources page
│   ├── components/
│   │   ├── Navbar.jsx         # Navigation bar
│   │   ├── Footer.jsx         # Footer
│   │   ├── LoginModal.jsx     # Magic link login modal
│   │   ├── Toast.jsx          # Toast notification
│   │   └── ToastContainer.jsx # Toast container
│   ├── context/
│   │   ├── AuthContext.jsx    # Authentication state
│   │   └── NotificationContext.jsx # Toast notifications
│   ├── config/
│   │   └── api.js             # API URL configuration
│   └── utils/
│       └── apiNotifications.js # API error handling
│
├── public/                     # Static assets
├── public_uploads/             # User-uploaded files (waivers, PDFs)
├── public_dist/                # Production build output
├── legacy_html/                # Legacy HTML pages (reference)
│
├── package.json               # Dependencies
├── vite.config.js             # Vite configuration
├── .gitignore                 # Git ignore rules
└── README.md                  # This file
```

---

## Getting Started

### Software I used

- **Node.js** 24.13.0 LTS and npm
- **PostgreSQL** 16
- **SSL Certificate** Let's Encrypt
- **SMTP account** (Brevo or similar)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd 123iliketoski/v2/public
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up PostgreSQL database**
   ```sql
   CREATE DATABASE skiclub;
   CREATE USER yourusername WITH PASSWORD 'somepassword';
   GRANT ALL PRIVILEGES ON DATABASE skiclub TO yourusername;
   ```

4. **Create database tables**
   ```sql
   -- Users table
   CREATE TABLE users (
     id SERIAL PRIMARY KEY,
     email VARCHAR(255) UNIQUE NOT NULL,
     is_umd_email BOOLEAN DEFAULT TRUE,
     role VARCHAR(20) DEFAULT 'user',
     created_at TIMESTAMPTZ DEFAULT NOW(),
     strikes INTEGER DEFAULT 0
   );

   -- Trips table
   CREATE TABLE trips (
     id SERIAL PRIMARY KEY,
     name VARCHAR(255) NOT NULL,
     date DATE NOT NULL,
     location VARCHAR(255),
     price DECIMAL(10, 2),
     capacity INTEGER,
     description TEXT,
     waiver_pdf_path TEXT,
     requires_checkin BOOLEAN DEFAULT FALSE,
     checkin_emails_sent BOOLEAN DEFAULT FALSE,
     checkin_reminder_emails_sent BOOLEAN DEFAULT FALSE,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );

   -- Registrations table
   CREATE TABLE registrations (
     id SERIAL PRIMARY KEY,
     trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
     user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
     equipment_rental VARCHAR(50),
     helmet_rental BOOLEAN DEFAULT FALSE,
     skill_level VARCHAR(50),
     emergency_contact_name VARCHAR(255),
     emergency_contact_phone VARCHAR(20),
     notes TEXT,
     filled_waiver_pdf_path TEXT,
     registered_at TIMESTAMPTZ DEFAULT NOW(),
     moved_to_waitlist BOOLEAN DEFAULT FALSE,
     waitlist_position INTEGER,
     check_in_deadline TIMESTAMPTZ,
     promoted_from_waitlist_at TIMESTAMPTZ,
     trip_checkin_token TEXT UNIQUE,
     checked_in BOOLEAN DEFAULT FALSE,
     check_in_response_at TIMESTAMPTZ,
     won_rental BOOLEAN DEFAULT FALSE,
     won_ticket BOOLEAN DEFAULT FALSE,
     custom_answers JSONB
   );

   -- Custom questions table
   CREATE TABLE custom_questions (
     id SERIAL PRIMARY KEY,
     trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
     question_text TEXT NOT NULL,
     question_order INTEGER DEFAULT 0,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );

   -- Announcements table
   CREATE TABLE announcements (
     id SERIAL PRIMARY KEY,
     title VARCHAR(255) NOT NULL,
     content TEXT NOT NULL,
     active BOOLEAN DEFAULT TRUE,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );

   -- Settings table
   CREATE TABLE settings (
     id SERIAL PRIMARY KEY,
     key VARCHAR(255) UNIQUE NOT NULL,
     value TEXT,
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );

   -- Attendance sessions table
   CREATE TABLE attendance_sessions (
     id SERIAL PRIMARY KEY,
     trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
     session_token TEXT UNIQUE NOT NULL,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );

   -- Attendance records table
   CREATE TABLE attendance (
     id SERIAL PRIMARY KEY,
     session_id INTEGER REFERENCES attendance_sessions(id) ON DELETE CASCADE,
     user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
     checked_in_at TIMESTAMPTZ DEFAULT NOW()
   );

   -- Activity logs table 
   CREATE TABLE activity_logs (
     id SERIAL PRIMARY KEY,
     timestamp TIMESTAMPTZ DEFAULT NOW(),
     user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
     trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,
     action_type VARCHAR(50) NOT NULL,
     description TEXT NOT NULL,
     performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
     metadata JSONB
   );

   -- Indexes
   CREATE INDEX idx_registrations_trip_id ON registrations(trip_id);
   CREATE INDEX idx_registrations_user_id ON registrations(user_id);
   CREATE INDEX idx_activity_logs_timestamp ON activity_logs(timestamp DESC);
   CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
   CREATE INDEX idx_activity_logs_trip_id ON activity_logs(trip_id);
   ```

5. **Configure environment variables**

   Create a `.env` file in the root directory:
   ```env
   PORT=443
   APP_BASE_URL=https://yourdomain.com

   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=yourusername
   DB_PASSWORD=yourpassword
   DB_NAME=skiclub

   JWT_SECRET=your-secure-random-secret-here

   SMTP_HOST=smtp-relay.brevo.com
   SMTP_PORT=587
   SMTP_USER=your-smtp-user
   SMTP_PASS=your-smtp-password
   SMTP_FROM="123 I Like To Ski <signup@yourdomain.com>"

   SSL_KEY=/path/to/privkey.pem
   SSL_CERT=/path/to/fullchain.pem
   ```

6. **Build the frontend**
   ```bash
   npm run build
   ```
   This creates the `dist` folder that the server will serve. (the server currently serves from public_dist)

7. **Start the server**
   ```bash
   node server/server.js
   ```

   For production, use PM2:
   ```bash
   pm2 start server/server.js --name skiclub
   ```

---

## Configuration

### Environment Variables

All configuration is managed through environment variables in `.env`:

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | HTTPS server port | `443` |
| `APP_BASE_URL` | Public URL of your app | `https://123iliketoski.com` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USER` | Database username | `postgres` |
| `DB_PASSWORD` | Database password | `yourpassword` |
| `DB_NAME` | Database name | `skiclub` |
| `JWT_SECRET` | Secret for signing JWT tokens | (generate random string) |
| `SMTP_HOST` | SMTP server hostname | `smtp-relay.brevo.com` |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_USER` | SMTP username | `your-user@smtp-brevo.com` |
| `SMTP_PASS` | SMTP password | `yourpassword` |
| `SMTP_FROM` | From email address | `"Club Name <email@domain.com>"` |
| `SSL_KEY` | Path to SSL private key | `/path/to/privkey.pem` |
| `SSL_CERT` | Path to SSL certificate | `/path/to/fullchain.pem` |

### Admin Setup

1. Register a user account via the web interface
2. Manually promote to admin in the database:
   ```sql
   UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
   ```
3. Log in and access `/admin` to manage the system

### Settings Management

Settings are stored in the `settings` table and can be toggled in the admin dashboard.

---

## Database Schema

### Core Tables

#### `users`
- `id` (PK): User identifier
- `email`: Email address (unique)
- `is_umd_email`: Whether email is @terpmail.umd.edu or not
- `role`: `user` or `admin`
- `strikes`: Number of no-show strikes
- `created_at`: Account creation timestamp

#### `trips`
- `id` (PK): Trip identifier
- `name`: Trip name/title
- `date`: Trip date
- `location`: Destination
- `price`: Cost per person
- `capacity`: Maximum participants
- `description`: Trip details
- `waiver_pdf_path`: Path to waiver PDF
- `requires_checkin`: Whether trip requires 24hr check-in
- `checkin_emails_sent`: Tracking flag for check-in emails
- `checkin_reminder_emails_sent`: Tracking flag for reminder emails

#### `registrations`
- `id` (PK): Registration identifier
- `trip_id` (FK): Reference to trips
- `user_id` (FK): Reference to users
- `equipment_rental`: Rental type (none/ski/snowboard/both)
- `helmet_rental`: Boolean for helmet rental
- `skill_level`: Beginner/Intermediate/Advanced/Expert
- `emergency_contact_name`: Emergency contact name
- `emergency_contact_phone`: Emergency contact phone
- `notes`: Additional notes
- `filled_waiver_pdf_path`: Path to signed waiver
- `registered_at`: Registration timestamp
- `moved_to_waitlist`: Whether on waitlist
- `waitlist_position`: Position in waitlist
- `check_in_deadline`: Deadline for promoted users
- `promoted_from_waitlist_at`: Promotion timestamp
- `trip_checkin_token`: Unique token for check-in
- `checked_in`: Whether user checked in
- `check_in_response_at`: Check-in response timestamp
- `won_rental`: Prize flag
- `won_ticket`: Prize flag
- `custom_answers`: JSON object for custom questions

#### `custom_questions`
- `id` (PK): Question identifier
- `trip_id` (FK): Reference to trips
- `question_text`: Question content
- `question_order`: Display order

#### `announcements`
- `id` (PK): Announcement identifier
- `title`: Announcement title
- `content`: Announcement body
- `active`: Whether currently displayed

#### `activity_logs`
- `id` (PK): Log identifier
- `timestamp`: When action occurred
- `user_id` (FK): User affected
- `trip_id` (FK): Trip affected
- `action_type`: Type of action (register, waitlist_promote, etc.)
- `description`: Human-readable description
- `performed_by` (FK): Admin who performed action
- `metadata`: Additional JSON data

#### `attendance_sessions`
- `id` (PK): Session identifier
- `trip_id` (FK): Associated trip
- `session_token`: Unique QR code token
- `created_at`: Session creation time

#### `attendance`
- `id` (PK): Attendance record identifier
- `session_id` (FK): Reference to attendance_sessions
- `user_id` (FK): User who checked in
- `checked_in_at`: Check-in timestamp

---

## API Documentation

### Public Endpoints

#### Authentication
- `POST /api/auth/request-magic-link` - Request magic link via email
- `GET /api/auth/verify-magic-link/:token` - Verify magic link token
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Log out

#### Trips
- `GET /api/trips` - List all trips
- `GET /api/trips/:id` - Get trip details
- `POST /api/trips/:id/register` - Register for trip
- `DELETE /api/trips/:id/cancel` - Cancel registration
- `GET /api/my-registrations` - Get user's registrations

#### Announcements
- `GET /api/announcements/active` - Get active announcement

#### Check-ins
- `GET /api/checkin/:token` - Get check-in details
- `POST /api/checkin/confirm` - Confirm check-in
- `POST /api/checkin/decline` - Decline check-in

#### Attendance
- `GET /api/attendance/:token` - Get attendance session
- `POST /api/attendance-bus/:token` - Check in to session

#### Custom Questions
- `GET /api/trips/:id/questions` - Get trip custom questions

### Admin Endpoints

All admin endpoints require authentication with `role = 'admin'`.

#### Trip Management
- `POST /api/admin/trips` - Create trip
- `PUT /api/admin/trips/:id` - Update trip
- `DELETE /api/admin/trips/:id` - delete trip
- `POST /api/admin/trips/:id/waiver` - Upload waiver
- `GET /api/admin/trips/:id/export` - Export roster to Excel
- `POST /api/admin/trips/:id/run-giveaway` - Run prize giveaway

#### Registration Management
- `GET /api/admin/trips/:id/registrations` - Get all registrations
- `GET /api/admin/registrations/:id` - get registration details for a person 
- `DELETE /api/admin/registrations/:id` - Remove registration
- `POST /api/admin/registrations/:id/award-rental` - Award rental prize
- `POST /api/admin/registrations/:id/award-ticket` - Award ticket prize
- `DELETE /api/admin/registrations/:id/remove-rental` - remove rental prize
- `DELETE /api/admin/registrations/:id/remove-ticket` - Remove ticket prize

#### Waitlist Management
- `POST /api/admin/registrations/:id/promote` - Promote from waitlist
- `POST /api/admin/registrations/:id/demote` - Demote to waitlist
- `PUT /api/admin/trips/:id/waitlist/reorder` - Reorder waitlist

#### User Management
- `GET /api/admin/users` - List all users
- `POST /api/admin/users/:id/strike` - Add strike
- `DELETE /api/admin/users/:id/strike` - Remove strike
- `DELETE /api/admin/users/:id/strikes` - Clear all strikes

#### Admin Management
- `GET /api/admin/admins` - List admins
- `POST /api/admin/admins` - Add admin
- `DELETE /api/admin/admins/:id` - Remove admin

#### Announcement Management
- `POST /api/admin/announcements` - Create announcement
- `PUT /api/admin/announcements/:id` - Update announcement
- `DELETE /api/admin/announcements/:id` - Delete announcement
- `PUT /api/admin/announcements/:id/pause` - Pause announcement
- `PUT /api/admin/announcements/:id/activate` - Activate announcement

#### Attendance Management
- `POST /api/admin/attendance/sessions` - Create attendance session
- `GET /api/admin/attendance/sessions/:id` - Get session details
- `DELETE /api/admin/attendance/sessions/:id` - Delete session
- `POST /api/admin/attendance/send-emails` - Send attendance emails

#### Settings
- `GET /api/admin/settings` - Get all settings
- `PUT /api/admin/settings/external-emails` - Toggle external emails
- `PUT /api/admin/settings/trip-safety` - Toggle trip safety

#### Dashboard
- `GET /api/admin/dashboard/stats` - Get dashboard statistics
- `GET /api/admin/activity-logs` - Get activity logs

#### PDF Management
- `POST /api/admin/pdf` - Upload PDF
- `GET /api/admin/pdf` - List PDFs
- `DELETE /api/admin/pdf/:filename` - Delete PDF

#### Custom Questions
- `POST /api/admin/trips/:id/questions` - Add custom question
- `DELETE /api/admin/questions/:id` - Delete custom question

---

## User Roles

### Public User
- Register for trips
- View trip details
- Cancel registrations
- Check in for trips
- Receive email notifications

### Admin User
- All public user capabilities
- Full CRUD access to trips
- Manage all registrations
- Manage waitlists
- Track attendance
- View analytics
- Manage announcements
- Configure settings
- Award prizes
- Export data

---

## Key Workflows

### Trip Registration Flow

1. User browses trips on homepage
2. User clicks on trip to view details
3. User clicks "Register" button
4. If not logged in, user receives magic link via email
5. User clicks magic link to authenticate
6. User fills out registration form:
   - Equipment rental selection
   - Skill level
   - Emergency contact
   - Custom questions (if any)
   - Accept terms
7. If trip is full, user is added to waitlist
8. User receives confirmation email
9. Admin can view registration in dashboard

### Waitlist Promotion Flow

1. Registered user cancels or is removed
2. Admin manually promotes next waitlist user OR automation runs
3. Promoted user receives email with check-in deadline
4. User has 24 hours to check in via magic link
5. If user confirms, registration is finalized
6. If user declines or deadline passes, next waitlist user is promoted
7. Activity is logged in admin dashboard

### 2-Day Trip Check-in Flow

1. Admin creates trip with `requires_checkin = true`
2. 24 hours before trip, system sends check-in emails to all registered users
3. Users receive email with check-in link
4. Users click link and confirm or decline attendance
5. Non-responders after deadline are marked as no-shows
6. Admin can manually process expired check-ins
7. No-shows receive strikes

### Bus Attendance Flow

1. Admin creates attendance session for trip
2. QR code is generated
3. Members scan QR code at bus departure
4. System records attendance with timestamp
5. Admin can view real-time attendance list
6. Admin can export attendance records
7. Admin can send attendance confirmation emails

### Prize Giveaway Flow

1. Admin navigates to trip in dashboard
2. Admin sets number of rental and ticket prizes
3. Admin clicks "Run Giveaway"
4. System randomly selects winners from registered users
5. Winners are marked with prize flags
6. Admin can manually award/remove prizes
7. Activity is logged

---

## Development

### Running Locally

1. **Start development server** (frontend)
   ```bash
   npm run dev
   ```
   Runs Vite dev server on `http://localhost:5173`

2. **Start backend server**
   ```bash
   node server/server.js
   ```
   Runs Express server on `https://localhost:443`

3. **Update API URL for local dev**

   Edit `src/config/api.js`:
   ```javascript
   export const apiUrl = (path) => {
     return `http://localhost:443${path}`; // or....wherever backend runs
   };
   ```


### PM2 Configuration (how I did it)

```bash
pm2 start server/server.js --name skiclub
pm2 restart all

```


---

