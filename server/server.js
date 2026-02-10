const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const https = require('https');

const { ssl, PORT } = require('./config');
const { runMigrations } = require('./migrations');

const app = express();

app.set('trust proxy', true);

app.use(express.json());
app.use(cookieParser());

const publicDist = path.join(__dirname, '..', 'public_dist');
app.use(express.static(publicDist, { index: false }));

const publicUploads = path.join(__dirname, '..', 'public_uploads');
app.use('/public_uploads', express.static(publicUploads, { fallthrough: false }));

const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

const tripRoutes = require('./routes/trips');
app.use('/api/trips', tripRoutes);

app.get('/api/my-registrations', (req, res, next) => {
  const originalUrl = req.url;
  const queryIndex = originalUrl.indexOf('?');
  const query = queryIndex === -1 ? '' : originalUrl.slice(queryIndex);
  req.url = `/my/registrations${query}`;
  tripRoutes(req, res, (err) => {
    req.url = originalUrl;
    next(err);
  });
});

const registrationRoutes = require('./routes/registrations');
app.use('/api/registrations', registrationRoutes);

const questionsRoutes = require('./routes/questions');
app.use('/api', questionsRoutes);

const announcementsRoutes = require('./routes/announcements');
app.use('/api/announcements', announcementsRoutes);
app.use('/api/admin/announcements', announcementsRoutes);

const checkinRoutes = require('./routes/checkin');
app.use('/api', checkinRoutes);

const waitlistRoutes = require('./routes/waitlist');
app.use('/api/admin/registrations', waitlistRoutes);
app.use('/api/admin/trips', waitlistRoutes);

const attendanceRoutes = require('./routes/attendance');
app.use('/api/attendance', attendanceRoutes);
app.use('/api/attendance-bus', attendanceRoutes);

const adminTripsRoutes = require('./routes/admin/trips');
const adminUsersRoutes = require('./routes/admin/users');
const adminAdminsRoutes = require('./routes/admin/admins');
const adminPdfRoutes = require('./routes/admin/pdf');
const adminSettingsRoutes = require('./routes/admin/settings');
const adminDashboardRoutes = require('./routes/admin/dashboard');
const adminAttendanceRoutes = require('./routes/admin/attendance');
const adminRegistrationsRoutes = require('./routes/admin/registrations');

app.use('/api/admin/trips', adminTripsRoutes);
app.use('/api/admin/users', adminUsersRoutes);
app.use('/api/admin/admins', adminAdminsRoutes);
app.use('/api/admin/pdf', adminPdfRoutes);
app.use('/api/admin/settings', adminSettingsRoutes);
app.use('/api/admin/dashboard', adminDashboardRoutes);
app.use('/api/admin', adminDashboardRoutes);
app.use('/api/admin/attendance', adminAttendanceRoutes);
app.use('/api/admin/registrations', adminRegistrationsRoutes);

const adminPagesRoutes = require('./routes/admin/pages');
app.use('/api/admin/pages', adminPagesRoutes);

const pagesRoutes = require('./routes/pages');
app.use('/api', pagesRoutes);

app.get(/^(?!\/api|\/uploads).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public_dist', 'index.html'));
});

runMigrations();

https.createServer(ssl, app).listen(PORT, () => {
  console.log(`HTTPS server running on https://123iliketoski.com:${PORT}`);
});
