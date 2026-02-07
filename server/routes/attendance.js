// ──────────────────────────────────────────────────────────────────────────────
// Public Attendance Routes
// Bus attendance check-in endpoints for students
// ──────────────────────────────────────────────────────────────────────────────

const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

const { pool, APP_BASE_URL, JWT_SECRET } = require('../config');
const { authRequired } = require('../middleware/auth');

// Get session info (public - for check-in page)
router.get('/session/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const { rows } = await pool.query(
      `SELECT s.id, s.bus_number, t.name as trip_name, t.trip_date
       FROM attendance_sessions s
       JOIN trips t ON t.id = s.trip_id
       WHERE s.qr_token = $1 AND s.is_active = TRUE`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired session' });
    }

    res.json(rows[0]);

  } catch (err) {
    console.error('Get session info error:', err);
    res.status(500).json({ error: 'Failed to get session info' });
  }
});

// Submit check-in
router.post('/checkin/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { first_name, last_name, user_id } = req.body;

    // Get session
    const { rows: [session] } = await pool.query(
      'SELECT id, trip_id FROM attendance_sessions WHERE qr_token = $1 AND is_active = TRUE',
      [token]
    );

    if (!session) {
      return res.status(404).json({ error: 'Invalid or expired session' });
    }

    // For logged-in users
    if (user_id) {
      const { rows: [user] } = await pool.query(
        'SELECT first_name, last_name FROM users WHERE id = $1',
        [user_id]
      );

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Try to insert check-in
      try {
        const { rows: [checkin] } = await pool.query(
          `INSERT INTO attendance_checkins (session_id, user_id, first_name, last_name)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [session.id, user_id, user.first_name, user.last_name]
        );

        return res.json({ ...checkin, matched: true });

      } catch (insertErr) {
        if (insertErr.code === '23505') { // Unique violation
          return res.status(400).json({ error: 'Already checked in' });
        }
        throw insertErr;
      }
    }

    // For guest check-in (name only)
    if (!first_name || !last_name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Validate names
    if (first_name.trim().length < 2) {
      return res.status(400).json({ error: 'First name must be at least 2 characters' });
    }
    if (last_name.trim().length < 1) {
      return res.status(400).json({ error: 'Last name is required' });
    }

    // Check if name matches anyone in the expected list (fuzzy matching)
    const { rows: expected } = await pool.query(
      `SELECT first_name, last_name FROM attendance_expected WHERE session_id = $1`,
      [session.id]
    );

    const norm = str => str ? str.toLowerCase().trim() : '';
    const cFirst = norm(first_name);
    const cLast = norm(last_name);

    // Try exact match first
    let isMatched = expected.some(exp =>
      norm(exp.first_name) === cFirst && norm(exp.last_name) === cLast
    );

    // If no exact match, try fuzzy matching
    if (!isMatched) {
      const candidates = expected.filter(exp => {
        const eFirst = norm(exp.first_name);
        const eLast = norm(exp.last_name);

        // Exact Last, Partial First (3+ characters)
        if (eLast === cLast && eFirst.startsWith(cFirst) && cFirst.length >= 3) return true;
        // Partial First, Partial Last (3+ characters)
        if (eFirst.startsWith(cFirst) && eLast.startsWith(cLast) && cFirst.length >= 3) return true;

        return false;
      });

      // Consider it matched if there's exactly one fuzzy match candidate
      isMatched = candidates.length === 1;
    }

    // Try to insert check-in
    try {
      const { rows: [checkin] } = await pool.query(
        `INSERT INTO attendance_checkins (session_id, first_name, last_name)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [session.id, first_name.trim(), last_name.trim()]
      );

      return res.json({ ...checkin, matched: isMatched });

    } catch (insertErr) {
      if (insertErr.code === '23505') { // Unique violation
        return res.status(400).json({ error: 'Already checked in' });
      }
      throw insertErr;
    }

  } catch (err) {
    console.error('Check-in error:', err);
    res.status(500).json({ error: 'Failed to check in' });
  }
});

// Check if user is already checked in (for auto-check-in)
router.get('/check-status/:token', authRequired, async (req, res) => {
  try {
    const { token } = req.params;

    const { rows } = await pool.query(
      `SELECT c.* FROM attendance_checkins c
       JOIN attendance_sessions s ON s.id = c.session_id
       WHERE s.qr_token = $1 AND c.user_id = $2`,
      [token, req.user.id]
    );

    if (rows.length > 0) {
      return res.json({ checked_in: true, checkin: rows[0] });
    }

    res.json({ checked_in: false });

  } catch (err) {
    console.error('Check status error:', err);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

// One-click bus attendance confirmation via email link
router.get('/confirm/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Verify and decode token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Invalid Link</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f4f4f4; }
            .container { background: white; padding: 40px; border-radius: 8px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: #e21833; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Invalid or Expired Link</h1>
            <p>This attendance confirmation link is invalid or has expired.</p>
          </div>
        </body>
        </html>
      `);
    }

    const { sessionId, userId, firstName, lastName } = decoded;

    // Verify session is still active
    const { rows: [session] } = await pool.query(
      `SELECT s.*, t.name as trip_name
       FROM attendance_sessions s
       JOIN trips t ON t.id = s.trip_id
       WHERE s.id = $1`,
      [sessionId]
    );

    if (!session) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Session Not Found</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f4f4f4; }
            .container { background: white; padding: 40px; border-radius: 8px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: #e21833; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Session Not Found</h1>
            <p>This attendance session no longer exists.</p>
          </div>
        </body>
        </html>
      `);
    }

    if (!session.is_active) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Session Ended</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f4f4f4; }
            .container { background: white; padding: 40px; border-radius: 8px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: #e21833; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Session Ended</h1>
            <p>This attendance session has been closed by the administrator.</p>
          </div>
        </body>
        </html>
      `);
    }

    // Try to insert check-in (or detect if already checked in)
    try {
      await pool.query(
        `INSERT INTO attendance_checkins (session_id, user_id, first_name, last_name)
         VALUES ($1, $2, $3, $4)`,
        [sessionId, userId, firstName, lastName]
      );

      // Success!
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Attendance Confirmed</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f4f4f4; }
            .container { background: white; padding: 40px; border-radius: 8px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: #28a745; }
            .checkmark { font-size: 64px; color: #28a745; margin: 20px 0; }
            p { color: #333; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="checkmark">✓</div>
            <h1>Attendance Confirmed!</h1>
            <p><strong>${firstName} ${lastName}</strong></p>
            <p>You've been marked as present on Bus ${session.bus_number} for ${session.trip_name}.</p>
            <p style="color: #666; font-size: 14px; margin-top: 30px;">You can close this window now.</p>
          </div>
        </body>
        </html>
      `);

    } catch (insertErr) {
      // Check if it's a duplicate (already checked in)
      if (insertErr.code === '23505') {
        return res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Already Confirmed</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f4f4f4; }
              .container { background: white; padding: 40px; border-radius: 8px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              h1 { color: #ffc107; }
              .checkmark { font-size: 64px; color: #ffc107; margin: 20px 0; }
              p { color: #333; line-height: 1.6; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="checkmark">✓</div>
              <h1>Already Confirmed</h1>
              <p><strong>${firstName} ${lastName}</strong></p>
              <p>You've already been marked as present on Bus ${session.bus_number}.</p>
              <p style="color: #666; font-size: 14px; margin-top: 30px;">You can close this window now.</p>
            </div>
          </body>
          </html>
        `);
      }
      throw insertErr;
    }

  } catch (err) {
    console.error('Bus attendance confirmation error:', err);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f4f4f4; }
          .container { background: white; padding: 40px; border-radius: 8px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          h1 { color: #e21833; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Error</h1>
          <p>An error occurred while confirming your attendance. Please try again or contact support.</p>
        </div>
      </body>
      </html>
    `);
  }
});

module.exports = router;
