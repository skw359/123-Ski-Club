// ──────────────────────────────────────────────────────────────────────────────
// Database Migrations
// Schema migrations and data backfilling
// ──────────────────────────────────────────────────────────────────────────────

const { pool } = require('../config');

async function runMigrations() {
  try {
    await pool.query('ALTER TABLE trips ADD COLUMN IF NOT EXISTS waiver_pdf_path TEXT');
    await pool.query('ALTER TABLE registrations ADD COLUMN IF NOT EXISTS filled_waiver_pdf_path TEXT');
    await pool.query('ALTER TABLE registrations ADD COLUMN IF NOT EXISTS won_rental BOOLEAN DEFAULT FALSE');
    await pool.query('ALTER TABLE registrations ADD COLUMN IF NOT EXISTS won_ticket BOOLEAN DEFAULT FALSE');
    await pool.query('ALTER TABLE trips ADD COLUMN IF NOT EXISTS checkin_emails_sent BOOLEAN DEFAULT FALSE');
    await pool.query('ALTER TABLE trips ADD COLUMN IF NOT EXISTS checkin_reminder_emails_sent BOOLEAN DEFAULT FALSE');
    await pool.query('ALTER TABLE registrations ADD COLUMN IF NOT EXISTS waitlist_position INTEGER');

    // Check-in deadline for promoted waitlist users
    await pool.query('ALTER TABLE registrations ADD COLUMN IF NOT EXISTS check_in_deadline TIMESTAMPTZ');
    await pool.query('ALTER TABLE registrations ADD COLUMN IF NOT EXISTS promoted_from_waitlist_at TIMESTAMPTZ');

    // 2-day trip check-in fields (separate from bus attendance check-in)
    await pool.query('ALTER TABLE trips ADD COLUMN IF NOT EXISTS requires_checkin BOOLEAN DEFAULT FALSE');
    await pool.query('ALTER TABLE registrations ADD COLUMN IF NOT EXISTS trip_checkin_token TEXT UNIQUE');
    await pool.query('ALTER TABLE registrations ADD COLUMN IF NOT EXISTS checked_in BOOLEAN DEFAULT FALSE');
    await pool.query('ALTER TABLE registrations ADD COLUMN IF NOT EXISTS check_in_response_at TIMESTAMPTZ');

    // Create activity logs table for tracking waitlist/registration movements
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,
        action_type VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        metadata JSONB
      )
    `);

    // Create index for faster queries
    await pool.query('CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_activity_logs_trip_id ON activity_logs(trip_id)');

    // Backfill waitlist_position for existing waitlisted users
    console.log('Backfilling waitlist positions for existing users...');

    // Get all trips that have waitlisted users without positions
    const { rows: trips } = await pool.query(`
      SELECT DISTINCT trip_id
      FROM registrations
      WHERE moved_to_waitlist = TRUE AND waitlist_position IS NULL
    `);

    for (const trip of trips) {
      // Get all waitlisted users for this trip, ordered by registration time
      const { rows: waitlistedUsers } = await pool.query(`
        SELECT id
        FROM registrations
        WHERE trip_id = $1 AND moved_to_waitlist = TRUE AND waitlist_position IS NULL
        ORDER BY registered_at ASC
      `, [trip.trip_id]);

      // Find the highest existing position for this trip
      const { rows: [maxPos] } = await pool.query(`
        SELECT MAX(waitlist_position) as max_pos
        FROM registrations
        WHERE trip_id = $1 AND moved_to_waitlist = TRUE AND waitlist_position IS NOT NULL
      `, [trip.trip_id]);

      let startPosition = (maxPos.max_pos || 0) + 1;

      // Assign positions
      for (const user of waitlistedUsers) {
        await pool.query(
          'UPDATE registrations SET waitlist_position = $1 WHERE id = $2',
          [startPosition, user.id]
        );
        startPosition++;
      }

      console.log(`  ✓ Assigned positions to ${waitlistedUsers.length} users for trip ${trip.trip_id}`);
    }

    console.log('Database migrations completed');
  } catch (err) {
    console.error('Migration error:', err);
  }
}

module.exports = {
  runMigrations,
};
