// ──────────────────────────────────────────────────────────────────────────────
// Admin Dashboard Routes
// Stats, activity logs, and analytics
// ──────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();

const { pool } = require('../../config');
const { adminRequired } = require('../../middleware/auth');

// All routes in this file require admin auth
router.use(adminRequired);

// Get dashboard stats
router.get('/stats', async (req, res) => {
  try {
    // Get active trips count
    const { rows: [activeTrips] } = await pool.query(
      'SELECT COUNT(*) as count FROM trips WHERE COALESCE(departure_time, trip_date) >= NOW()'
    );

    // Get total users
    const { rows: [totalUsers] } = await pool.query(
      'SELECT COUNT(*) as count FROM users'
    );

    // Get upcoming trips with low availability
    const { rows: upcomingTrips } = await pool.query(
      `SELECT t.id, t.name, t.trip_date, t.capacity,
              COUNT(r.id) as registered_count
       FROM trips t
       LEFT JOIN registrations r ON r.trip_id = t.id
       WHERE COALESCE(t.departure_time, t.trip_date) >= NOW()
       GROUP BY t.id, t.name, t.trip_date, t.capacity
       ORDER BY t.trip_date ASC
       LIMIT 5`
    );

    // Get recent registrations (Last 7 Days)
const { rows: recentRegistrations } = await pool.query(
  `SELECT u.email, u.first_name, u.last_name, t.name as trip_name, r.registered_at
   FROM registrations r
   JOIN users u ON u.id = r.user_id
   JOIN trips t ON t.id = r.trip_id
   WHERE r.registered_at >= NOW() - INTERVAL '7 days'
   ORDER BY r.registered_at DESC`
);

    // Get new users (Last 7 Days)
    const { rows: [newUsersWeek] } = await pool.query(
      'SELECT COUNT(*) as count FROM users WHERE created_at >= NOW() - INTERVAL \'7 days\''
    );

    // Get new users (Last 30 Days)
    const { rows: [newUsersMonth] } = await pool.query(
      'SELECT COUNT(*) as count FROM users WHERE created_at >= NOW() - INTERVAL \'30 days\''
    );

    res.json({
      activeTrips: Number(activeTrips.count),
      totalUsers: Number(totalUsers.count),
      upcomingTrips: upcomingTrips.map(trip => ({
        ...trip,
        registered_count: Number(trip.registered_count),
        spots_remaining: trip.capacity - Number(trip.registered_count)
      })),
      recentRegistrations,
      newUsersWeek: Number(newUsersWeek.count),
      newUsersMonth: Number(newUsersMonth.count)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// Get activity logs with filters
router.get('/activity-logs', async (req, res) => {
  try {
    const { page = 1, limit = 50, userId, tripId, actionType } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = [];
    let queryParams = [];
    let paramIndex = 1;

    if (userId) {
      whereClause.push(`al.user_id = $${paramIndex}`);
      queryParams.push(Number(userId));
      paramIndex++;
    }

    if (tripId) {
      whereClause.push(`al.trip_id = $${paramIndex}`);
      queryParams.push(Number(tripId));
      paramIndex++;
    }

    if (actionType) {
      whereClause.push(`al.action_type = $${paramIndex}`);
      queryParams.push(actionType);
      paramIndex++;
    }

    const whereSQL = whereClause.length > 0 ? 'WHERE ' + whereClause.join(' AND ') : '';

    // Get total count
    const { rows: [{ count }] } = await pool.query(
      `SELECT COUNT(*) as count FROM activity_logs al ${whereSQL}`,
      queryParams
    );

    // Get logs with user and trip info
    const { rows: logs } = await pool.query(
      `SELECT
        al.id,
        al.timestamp AT TIME ZONE 'America/New_York' as timestamp_est,
        al.user_id,
        al.trip_id,
        al.action_type,
        al.description,
        al.performed_by,
        al.metadata,
        u.email as user_email,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        t.name as trip_name,
        admin_user.email as admin_email,
        admin_user.first_name as admin_first_name,
        admin_user.last_name as admin_last_name
      FROM activity_logs al
      LEFT JOIN users u ON u.id = al.user_id
      LEFT JOIN trips t ON t.id = al.trip_id
      LEFT JOIN users admin_user ON admin_user.id = al.performed_by
      ${whereSQL}
      ORDER BY al.timestamp DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...queryParams, Number(limit), offset]
    );

    res.json({
      logs,
      pagination: {
        total: Number(count),
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
});

// Get daily signup statistics
router.get('/stats/daily-signups', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const daysLimit = Math.min(Math.max(Number(days), 1), 365); // Between 1 and 365 days

    // First check total users and if created_at exists
    const { rows: [totalCheck] } = await pool.query(
      `SELECT
        COUNT(*) as total_users,
        COUNT(created_at) as users_with_created_at,
        MIN(created_at) as oldest_signup,
        MAX(created_at) as newest_signup
       FROM users`
    );
    console.log('Total users:', totalCheck.total_users, 'Users with created_at:', totalCheck.users_with_created_at);

    const { rows } = await pool.query(
      `SELECT
        DATE(created_at) as signup_date,
        COUNT(*) as count
       FROM users
       WHERE created_at >= CURRENT_DATE - $1 * INTERVAL '1 day'
       GROUP BY DATE(created_at)
       ORDER BY signup_date DESC`,
      [daysLimit]
    );

    console.log(`Signup stats for last ${daysLimit} days:`, rows.length, 'days with signups');

    res.json({
      data: rows.map(row => ({
        date: row.signup_date,
        signups: Number(row.count)
      })),
      totalSignups: rows.reduce((sum, row) => sum + Number(row.count), 0),
      daysRequested: daysLimit,
      debug: {
        totalUsers: Number(totalCheck.total_users),
        usersWithCreatedAt: Number(totalCheck.users_with_created_at),
        oldestSignup: totalCheck.oldest_signup,
        newestSignup: totalCheck.newest_signup
      }
    });
  } catch (err) {
    console.error('Error in daily-signups endpoint:', err);
    res.status(500).json({ error: 'Failed to fetch daily signup statistics', details: err.message });
  }
});

module.exports = router;
