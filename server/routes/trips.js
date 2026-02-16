const express = require('express');
const router = express.Router();
const fs = require('fs');

const { pool } = require('../config');
const { authRequired } = require('../middleware/auth');
const { waiverUpload } = require('../middleware/multer');

async function saveCustomAnswers(client, registrationId, customAnswers) {
  if (!customAnswers || Object.keys(customAnswers).length === 0) {
    return;
  }

  for (const [questionId, answer] of Object.entries(customAnswers)) {
    const answerText = typeof answer === 'string'
      ? answer.trim()
      : String(answer ?? '').trim();

    if (answerText.length > 0) {
      await client.query(
        `INSERT INTO registration_custom_answers (registration_id, question_id, answer_text)
         VALUES ($1, $2, $3)
         ON CONFLICT (registration_id, question_id)
         DO UPDATE SET answer_text = $3`,
        [registrationId, Number(questionId), answerText]
      );
    }
  }
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return Boolean(value);
}

function parseCustomAnswers(value) {
  if (!value) return {};

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  return typeof value === 'object' ? value : {};
}

router.get('/', async (req, res) => {
  try {
    const { rows: trips } = await pool.query(
      `SELECT id, name, destination, description, trip_date, capacity, image_url, departure_info, return_info, registration_opens_at, departure_time, requires_checkin, checkin_emails_sent
   FROM trips
  ORDER BY trip_date ASC`
    );

    const results = await Promise.all(
      trips.map(async (t) => {
        const { rows: [c] } = await pool.query(
          'SELECT COUNT(*)::int AS registered_count FROM registrations WHERE trip_id = $1',
          [t.id]
        );
        const registered_count = c.registered_count || 0;
        return {
          ...t,
          registered_count,
          spots_remaining: t.capacity - registered_count
        };
      }));

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unable to fetch trips' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const tripId = Number(req.params.id);
    const { rows: [t] } = await pool.query(
      `SELECT id, name, destination, description, trip_date, capacity, image_url, departure_info, return_info, ask_default_questions, registration_opens_at, departure_time, waiver_pdf_path, requires_checkin, checkin_emails_sent
       FROM trips WHERE id = $1`,
      [tripId]
    );
    if (!t) return res.status(404).json({ error: 'Trip not found' });

    const { rows: [c] } = await pool.query(
      'SELECT COUNT(*)::int AS registered_count FROM registrations WHERE trip_id = $1',
      [tripId]
    );
    const registered_count = c.registered_count || 0;

    res.json({
      ...t,
      registered_count,
      spots_remaining: t.capacity - registered_count
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unable to fetch trip' });
  }
});

router.post('/:id/register', authRequired, waiverUpload.single('waiver'), async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;
  const cleanupUploadedWaiver = () => {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  };

  try {
    const tripId = Number(req.params.id);
    const userId = req.user.id;
    const requestBody = (req.body && typeof req.body === 'object') ? req.body : {};
    const {
        equipment_rental, helmet_rental, skill_level,
        emergency_contact_name, emergency_contact_phone,
        special_requests, terms_agreed, custom_answers
    } = requestBody;
    const customAnswers = parseCustomAnswers(custom_answers);
    const helmetRental = parseBoolean(helmet_rental, false);
    const termsAgreed = parseBoolean(terms_agreed, true);
    const uploadedWaiverPath = req.file ? `waivers/${req.file.filename}` : null;

    const { rows: [trip] } = await pool.query('SELECT * FROM trips WHERE id = $1', [tripId]);
    const { rows: [user] } = await pool.query('SELECT strike_count FROM users WHERE id = $1', [userId]);

    if (!trip) {
      cleanupUploadedWaiver();
      return res.status(404).json({ error: 'Trip not found' });
    }

    if (trip.waiver_pdf_path && !uploadedWaiverPath) {
      return res.status(400).json({ error: 'Signed waiver PDF is required before registering for this trip.' });
    }

    const tripTime = new Date(trip.departure_time || trip.trip_date);
    if (tripTime < new Date()) {
      cleanupUploadedWaiver();
      return res.status(400).json({ error: 'Registration is closed. This trip has already departed.' });
    }

    const strikes = user.strike_count || 0;
    if (strikes >= 2) {
      cleanupUploadedWaiver();
      return res.status(403).json({ error: 'You are currently banned from signing up due to previous no-shows.' });
    }

    let openTime = new Date(trip.registration_opens_at || trip.created_at);
    if (strikes === 1) {
      openTime = new Date(openTime.getTime() + 24 * 60 * 60 * 1000);
    }

    if (new Date() < openTime) {
      cleanupUploadedWaiver();
      const msg = strikes === 1
        ? `Due to a strike (one no-show for a previous trip), your signup is delayed 24hrs. Opens: ${openTime.toISOString()}`
        : `Registration opens on ${openTime.toISOString()}`;
      return res.status(403).json({ error: msg });
    }

    await client.query('BEGIN');
    transactionStarted = true;

    const { rows: [c] } = await client.query(
      'SELECT COUNT(*)::int AS count FROM registrations WHERE trip_id = $1 AND moved_to_waitlist = FALSE',
      [tripId]
    );

    const currentCount = c.count || 0;
    let addToWaitlist = false;
    let waitlistPosition = null;

    if (currentCount >= trip.capacity) {
      addToWaitlist = true;
      const { rows: [maxPos] } = await client.query(
        'SELECT MAX(waitlist_position) as max_pos FROM registrations WHERE trip_id = $1 AND moved_to_waitlist = TRUE',
        [tripId]
      );
      waitlistPosition = (maxPos.max_pos || 0) + 1;
    }

    const { rows: [newReg] } = await client.query(
      `INSERT INTO registrations (
        trip_id, user_id, equipment_rental, helmet_rental,
        skill_level, emergency_contact_name, emergency_contact_phone,
        special_requests, terms_agreed, moved_to_waitlist, waitlist_position,
        filled_waiver_pdf_path
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id`,
      [
        tripId, userId,
        equipment_rental || 'none',
        helmetRental,
        skill_level || 'beginner',
        emergency_contact_name || 'N/A',
        emergency_contact_phone || 'N/A',
        special_requests || '',
        termsAgreed,
        addToWaitlist,
        waitlistPosition,
        uploadedWaiverPath
      ]
    );

    if (Object.keys(customAnswers).length > 0) {
        await saveCustomAnswers(client, newReg.id, customAnswers);
    }

    await client.query('COMMIT');

    if (addToWaitlist) {
      res.json({ status: 'waitlist', message: 'Trip is full. You have been added to the waitlist.' });
    } else {
      res.json({ status: 'confirmed', message: 'Registered successfully!' });
    }

  } catch (err) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }

    cleanupUploadedWaiver();

    if (err.code === '23505') return res.status(409).json({ error: 'You are already registered.' });
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  } finally {
    client.release();
  }
});

router.get('/my/registrations', authRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(
  `SELECT r.id, r.trip_id,
          r.moved_to_waitlist, r.registered_at, r.waitlist_position,
          r.promotion_expires_at, r.filled_waiver_pdf_path, u.strike_count,
          r.is_manual_registration,
          r.checked_in, r.trip_checkin_token, r.promoted_from_waitlist_at,
          t.name, t.destination, t.trip_date, t.departure_time, t.image_url, t.waiver_pdf_path, t.requires_checkin
   FROM registrations r
   JOIN trips t ON t.id = r.trip_id
   JOIN users u ON u.id = r.user_id
   WHERE r.user_id = $1 AND COALESCE(t.departure_time, t.trip_date) >= NOW()
   ORDER BY t.trip_date ASC`,
  [req.user.id]
);

    const enrichedRegistrations = await Promise.all(rows.map(async reg => {
      let actualWaitlistPosition = null;
      if (reg.moved_to_waitlist) {
        const { rows: waitlistQueue } = await pool.query(
          `SELECT r.id
           FROM registrations r
           WHERE r.trip_id = $1 AND r.moved_to_waitlist = TRUE
           ORDER BY COALESCE(r.waitlist_position, 999999) ASC, r.registered_at ASC`,
          [reg.trip_id]
        );
        actualWaitlistPosition = waitlistQueue.findIndex(w => w.id === reg.id) + 1;
      }

      const tripDate = new Date(reg.trip_date);
      const now = new Date();
      const hoursUntilTrip = (tripDate - now) / (1000 * 60 * 60);
      const daysUntilTrip = Math.ceil(hoursUntilTrip / 24);

      let needsCheckIn = false;
      let checkInMinutesRemaining = null;

      if (reg.requires_checkin && reg.trip_checkin_token && !reg.moved_to_waitlist && !reg.checked_in && !reg.promoted_from_waitlist_at) {
        const checkInStart = new Date(tripDate);
        checkInStart.setDate(checkInStart.getDate() - 2);
        checkInStart.setHours(0, 0, 0, 0);

        const checkInEnd = new Date(checkInStart);
        checkInEnd.setHours(23, 59, 59, 999);

        if (now >= checkInStart && now <= checkInEnd) {
          needsCheckIn = true;
          checkInMinutesRemaining = Math.floor((checkInEnd - now) / (1000 * 60));
        }
      }

      return {
        ...reg,
        waitlist_position: actualWaitlistPosition,
        days_until_trip: daysUntilTrip,
        needs_check_in: needsCheckIn,
        check_in_minutes_remaining: checkInMinutesRemaining
      };
    }));

    res.json(enrichedRegistrations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch registrations' });
  }
});

router.post('/:id/confirm-promotion', authRequired, async (req, res) => {
  try {
    const tripId = Number(req.params.id);
    const userId = req.user.id;

    const { rows: [reg] } = await pool.query(
      'SELECT id, promotion_expires_at FROM registrations WHERE trip_id = $1 AND user_id = $2',
      [tripId, userId]
    );

    if (!reg) return res.status(404).json({ error: 'Registration not found' });

    if (!reg.promotion_expires_at) {
        return res.json({ success: true, message: 'You are already confirmed.' });
    }

    await pool.query(
      'UPDATE registrations SET promotion_expires_at = NULL, checked_in = TRUE WHERE id = $1',
      [reg.id]
    );

    res.json({ success: true, message: 'Spot confirmed! You are now on the trip roster.' });
  } catch (err) {
    console.error("Confirmation Error:", err);
    res.status(500).json({ error: 'Confirmation failed' });
  }
});

module.exports = router;
