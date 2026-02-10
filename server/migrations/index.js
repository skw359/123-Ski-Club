// Database Migrations

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

    // check-in deadline for promoted waitlist users
    await pool.query('ALTER TABLE registrations ADD COLUMN IF NOT EXISTS check_in_deadline TIMESTAMPTZ');
    await pool.query('ALTER TABLE registrations ADD COLUMN IF NOT EXISTS promoted_from_waitlist_at TIMESTAMPTZ');

    // 2-day trip check-in fields (*separate from bus attendance check-in)
    await pool.query('ALTER TABLE trips ADD COLUMN IF NOT EXISTS requires_checkin BOOLEAN DEFAULT FALSE');
    await pool.query('ALTER TABLE registrations ADD COLUMN IF NOT EXISTS trip_checkin_token TEXT UNIQUE');
    await pool.query('ALTER TABLE registrations ADD COLUMN IF NOT EXISTS checked_in BOOLEAN DEFAULT FALSE');
    await pool.query('ALTER TABLE registrations ADD COLUMN IF NOT EXISTS check_in_response_at TIMESTAMPTZ');

    // creaet activity logs table for tracking waitlist/registration movements
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

    await pool.query('CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_activity_logs_trip_id ON activity_logs(trip_id)');

    console.log('Backfilling waitlist positions for existing users...');

    // get all trips that have waitlisted users without positions
    const { rows: trips } = await pool.query(`
      SELECT DISTINCT trip_id
      FROM registrations
      WHERE moved_to_waitlist = TRUE AND waitlist_position IS NULL
    `);

    for (const trip of trips) {
      // get all waitlisted users for this trip, ordered by registration time
      const { rows: waitlistedUsers } = await pool.query(`
        SELECT id
        FROM registrations
        WHERE trip_id = $1 AND moved_to_waitlist = TRUE AND waitlist_position IS NULL
        ORDER BY registered_at ASC
      `, [trip.trip_id]);

      // f the highest existing position for this trip
      const { rows: [maxPos] } = await pool.query(`
        SELECT MAX(waitlist_position) as max_pos
        FROM registrations
        WHERE trip_id = $1 AND moved_to_waitlist = TRUE AND waitlist_position IS NOT NULL
      `, [trip.trip_id]);

      let startPosition = (maxPos.max_pos || 0) + 1;

      for (const user of waitlistedUsers) {
        await pool.query(
          'UPDATE registrations SET waitlist_position = $1 WHERE id = $2',
          [startPosition, user.id]
        );
        startPosition++;
      }

      console.log(`  ✓ Assigned positions to ${waitlistedUsers.length} users for trip ${trip.trip_id}`);
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS page_content (
        id SERIAL PRIMARY KEY,
        content_key VARCHAR(100) UNIQUE NOT NULL,
        content_value TEXT,
        content_type VARCHAR(20) DEFAULT 'text',
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    const pageDefaults = [
      ['home_hero_title', "Welcome to UMD's Premier Ski & Snowboard Club", 'text'],
      ['home_hero_subtitle', 'Join us for exciting trips, events, and an awesome community of snow enthusiasts!', 'text'],
      ['home_hero_image', '/assets/background.jpg', 'image'],
      ['home_banner_logo', null, 'image'],
      ['about_section_1_title', 'Who We Are', 'text'],
      ['about_section_1_body', 'Founded in 2022, we are the largest student organization at the University of Maryland dedicated to bringing affordable and fun skiing and snowboarding experiences to students.', 'text'],
      ['about_section_2_title', 'Our Mission', 'text'],
      ['about_section_2_body', 'We foster a vibrant community of snow sports enthusiasts by providing accessible trips for all skill levels. Whether you are a seasoned pro or have never seen snow before, there is a spot for you on the mountain.', 'text'],
      ['about_section_3_title', 'Join The Club', 'text'],
      ['about_section_3_body', 'We organize over 7 trips every season to resorts across the region. Members get access to exclusive group rates, transportation, and social events.', 'text'],
      ['about_image', '/assets/IMG_7121.JPG', 'image'],
    ];

    for (const [key, value, type] of pageDefaults) {
      await pool.query(
        `INSERT INTO page_content (content_key, content_value, content_type)
         VALUES ($1, $2, $3)
         ON CONFLICT (content_key) DO NOTHING`,
        [key, value, type]
      );
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS faqs (
        id SERIAL PRIMARY KEY,
        category VARCHAR(100) NOT NULL,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        category_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const faqDefaults = [
      ['General Questions', 'Do I need to know how to ski or snowboard to join?', 'Absolutely not! We welcome members of all skill levels, from complete beginners to experienced riders. Many of our trips include optional lessons for beginners, and our community is supportive of those learning for the first time.', 0, 0],
      ['General Questions', 'Can non-UMD students join trips?', 'Our trips are primarily for UMD students, but guests may be allowed depending on availability. UMD students always have priority for trip spots. Contact us for more information about bringing guests.', 1, 0],
      ['Trip Information', 'How much do trips typically cost?', "Costs can vary, but generally it's not too expensive. Transportation is free, but there are things like lift tickets and equipment rental. We work hard to negotiate group rates to keep costs as affordable as possible for students.", 0, 1],
      ['Trip Information', 'Do I need my own equipment?', 'No, equipment rental is available for all trips. You can choose a package that includes rental gear, or bring your own if you have it. Helmets are also available for rent and highly recommended for safety.', 1, 1],
      ['Trip Information', 'How do I register for trips?', "Trip registration opens one week before each trip date. You'll need to create an account and log in with your UMD credentials to register. Spots are limited to bus capacity (typically 54 seats), so be sure to register early!", 2, 1],
      ['Trip Information', 'What is the check-in process?', "All registered participants must confirm their attendance 2 days before the trip through our check-in system. You'll receive an email with a 24-hour window to complete this process. This helps us manage the waitlist effectively and ensure full buses.", 3, 1],
      ['Membership & Benefits', 'How do I become a member?', 'Membership is automatically granted when you register for your first trip with us. There is no separate membership fee - we believe in providing value through our trips and events rather than charging for membership.', 0, 2],
      ['Membership & Benefits', 'What benefits do members receive?', 'Members get access to all our trips at discounted rates, invitations to social events throughout the year, eligibility for our points program that offers additional discounts, and connections to our partner shops for equipment deals and seasonal rentals.', 1, 2],
    ];

    const { rows: existingFaqs } = await pool.query('SELECT COUNT(*) as count FROM faqs');
    if (parseInt(existingFaqs[0].count) === 0) {
      for (const [category, question, answer, sort_order, category_order] of faqDefaults) {
        await pool.query(
          `INSERT INTO faqs (category, question, answer, sort_order, category_order) VALUES ($1, $2, $3, $4, $5)`,
          [category, question, answer, sort_order, category_order]
        );
      }
    }

    console.log('Database migrations completed');
  } catch (err) {
    console.error('Migration error:', err);
  }
}

module.exports = {
  runMigrations,
};
