const express = require('express');
const router = express.Router();

const { pool } = require('../../config');
const { logActivity } = require('../../utils/logger');
const { adminRequired } = require('../../middleware/auth');

router.use(adminRequired);

router.get('/:id', async (req, res) => {
  try {
    const registrationId = Number(req.params.id);

    const { rows: [registration] } = await pool.query(
      `SELECT r.id as registration_id, r.registered_at,
              r.equipment_rental, r.helmet_rental, r.skill_level,
              r.emergency_contact_name, r.emergency_contact_phone,
              r.special_requests, r.terms_agreed,
              u.id as user_id, u.email, u.first_name, u.last_name,
              t.name as trip_name, t.trip_date
       FROM registrations r
       JOIN users u ON u.id = r.user_id
       JOIN trips t ON t.id = r.trip_id
       WHERE r.id = $1`,
      [registrationId]
    );

    if (!registration) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    res.json(registration);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch registration details' });
  }
});

router.get('/:id/details', async (req, res) => {
  try {
    const registrationId = Number(req.params.id);

    const { rows: [registration] } = await pool.query(
      `SELECT r.id as registration_id, r.registered_at,
              r.equipment_rental, r.helmet_rental, r.skill_level,
              r.emergency_contact_name, r.emergency_contact_phone,
              r.special_requests, r.terms_agreed,
              u.id as user_id, u.email, u.first_name, u.last_name,
              t.id as trip_id, t.name as trip_name, t.trip_date
       FROM registrations r
       JOIN users u ON u.id = r.user_id
       JOIN trips t ON t.id = r.trip_id
       WHERE r.id = $1`,
      [registrationId]
    );

    if (!registration) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    const { rows: customAnswers } = await pool.query(
      `SELECT q.question_text, q.question_type, COALESCE(a.answer_text, '') as answer_text
       FROM trip_custom_questions q
       LEFT JOIN registration_custom_answers a ON a.question_id = q.id AND a.registration_id = $1
       WHERE q.trip_id = $2
       ORDER BY q.display_order ASC`,
      [registrationId, registration.trip_id]
    );

    res.json({
      ...registration,
      custom_answers: customAnswers
    });

  } catch (err) {
    console.error('Failed to fetch registration details:', err);
    res.status(500).json({ error: 'Failed to fetch registration details' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const regId = Number(req.params.id);

    const { rows: [reg] } = await pool.query(
      'SELECT r.user_id, r.trip_id, r.moved_to_waitlist, t.name as trip_name FROM registrations r JOIN trips t ON t.id = r.trip_id WHERE r.id = $1',
      [regId]
    );

    if (reg) {
      await pool.query('DELETE FROM registrations WHERE id = $1', [regId]);

      await logActivity({
        userId: reg.user_id,
        tripId: reg.trip_id,
        actionType: 'ADMIN_REMOVED',
        description: `Removed from ${reg.moved_to_waitlist ? 'waitlist' : 'active roster'} by admin for ${reg.trip_name}`,
        performedBy: req.user.id,
        metadata: { tripName: reg.trip_name, wasOnWaitlist: reg.moved_to_waitlist }
      });
    } else {
      await pool.query('DELETE FROM registrations WHERE id = $1', [regId]);
    }

    // AUTOMATION: Run automation immediately to fill the spot from waitlist
    // TEMPORARILY DISABLED - uncomment to re-enable
    // const { runAutomation } = require('../waitlist');
    // await runAutomation();

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove registration' });
  }
});

// Manually toggle prize for a specific registration
router.put('/:id/prize', async (req, res) => {
  try {
    const regId = Number(req.params.id);
    const { prize_type, value } = req.body;

    if (!['rental', 'ticket'].includes(prize_type)) {
      return res.status(400).json({ error: 'Invalid prize type. Must be "rental" or "ticket"' });
    }

    if (typeof value !== 'boolean') {
      return res.status(400).json({ error: 'Value must be a boolean' });
    }

    const column = prize_type === 'rental' ? 'won_rental' : 'won_ticket';

    await pool.query(
      `UPDATE registrations SET ${column} = $1 WHERE id = $2`,
      [value, regId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update prize' });
  }
});

// Mark physical attendance for a registration
router.put('/:id/attendance', async (req, res) => {
  try {
    const registrationId = Number(req.params.id);
    const { physically_present } = req.body;

    if (typeof physically_present !== 'boolean') {
      return res.status(400).json({ error: 'physically_present must be a boolean' });
    }

    const { rows } = await pool.query(
      `UPDATE registrations
       SET physically_present = $1
       WHERE id = $2
       RETURNING id, physically_present`,
      [physically_present, registrationId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    res.json({ success: true, registration: rows[0] });

  } catch (err) {
    console.error('Failed to update attendance:', err);
    res.status(500).json({ error: 'Failed to update attendance' });
  }
});

// Note: Promote/demote endpoints are in routes/waitlist.js
// Note: User waiver upload has been moved to /api/registrations/:id/waiver
// See routes/registrations.js for the user-facing waiver upload endpoint

module.exports = router;
