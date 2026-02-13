const express = require('express');
const router = express.Router();

const { pool } = require('../../config');
const { logActivity } = require('../../utils/logger');
const { adminRequired } = require('../../middleware/auth');
const { waiverUpload, tripImageUpload } = require('../../middleware/multer');
const fs = require('fs');
const path = require('path');

router.use(adminRequired);

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM trips
      ORDER BY trip_date DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching admin trips:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, destination, description, trip_date, capacity, image_url, departure_info, return_info, ask_default_questions, registration_opens_at, departure_time, requires_checkin } = req.body;

    if (!name || !destination || !trip_date) {
      return res.status(400).json({ error: 'Name, destination, and trip date are required' });
    }

    const { rows } = await pool.query(
  `INSERT INTO trips (
    name, destination, description, trip_date, capacity, image_url,
    departure_info, return_info, ask_default_questions,
    registration_opens_at, departure_time, requires_checkin
  )
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
   RETURNING *`,
  [
    name, destination, description, trip_date, capacity || 54, image_url,
    departure_info, return_info, ask_default_questions ?? true,
    registration_opens_at, departure_time, requires_checkin ?? false
  ]
);

    const newTrip = rows[0];

    await logActivity({
      tripId: newTrip.id,
      actionType: 'TRIP_CREATED',
      description: `Created trip "${name}" to ${destination} on ${new Date(trip_date).toLocaleDateString()}`,
      performedBy: req.user.id,
      metadata: { tripName: name, destination, tripDate: trip_date, capacity: capacity || 54 }
    });

    res.json(newTrip);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create trip' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const tripId = Number(req.params.id);

    const { rows: oldRows } = await pool.query('SELECT * FROM trips WHERE id = $1', [tripId]);
    if (oldRows.length === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    const oldTrip = oldRows[0];

    const {
        name, destination, description, trip_date, capacity, image_url,
        departure_info, return_info, ask_default_questions,
        registration_opens_at, departure_time, requires_checkin
    } = req.body;

    const { rows } = await pool.query(
      `UPDATE trips
       SET name = $1, destination = $2, description = $3,
           trip_date = $4, capacity = $5, image_url = $6,
           departure_info = $7, return_info = $8, ask_default_questions = $9,
           registration_opens_at = $10, departure_time = $11, requires_checkin = $12
       WHERE id = $13
       RETURNING *`,
      [
        name, destination, description, trip_date, capacity, image_url,
        departure_info, return_info, ask_default_questions,
        registration_opens_at, // $10
        departure_time,        // $11
        requires_checkin,      // $12
        tripId                 // $13
      ]
    );

    const updatedTrip = rows[0];

    const changes = [];
    if (oldTrip.name !== name) changes.push(`name from "${oldTrip.name}" to "${name}"`);
    if (oldTrip.destination !== destination) changes.push(`destination from "${oldTrip.destination}" to "${destination}"`);
    if (oldTrip.description !== description) changes.push(`description`);
    if (new Date(oldTrip.trip_date).toDateString() !== new Date(trip_date).toDateString()) {
      changes.push(`trip date from ${new Date(oldTrip.trip_date).toLocaleDateString()} to ${new Date(trip_date).toLocaleDateString()}`);
    }
    if (Number(oldTrip.capacity) !== Number(capacity)) {
      changes.push(`capacity from ${oldTrip.capacity} to ${capacity}`);
    }
    if (oldTrip.image_url !== image_url) changes.push(`image URL`);
    if (oldTrip.departure_info !== departure_info) changes.push(`departure info`);
    if (oldTrip.return_info !== return_info) changes.push(`return info`);

    const oldTimeStr = oldTrip.departure_time ? new Date(oldTrip.departure_time).toISOString() : null;
    const newTimeStr = departure_time ? new Date(departure_time).toISOString() : null;
    if (oldTimeStr !== newTimeStr) {
      const oldTime = oldTrip.departure_time ? new Date(oldTrip.departure_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'not set';
      const newTime = departure_time ? new Date(departure_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'not set';
      changes.push(`departure time from ${oldTime} to ${newTime}`);
    }

    const changeDescription = changes.length > 0
      ? `Updated trip "${name}" - Changed ${changes.join(', ')}`
      : `Updated trip "${name}" - No significant changes detected`;

    await logActivity({
      tripId: tripId,
      actionType: 'TRIP_UPDATED',
      description: changeDescription,
      performedBy: req.user.id,
      metadata: {
        tripName: name,
        destination,
        changes: changes,
        oldValues: { capacity: oldTrip.capacity, trip_date: oldTrip.trip_date },
        newValues: { capacity, trip_date }
      }
    });

    res.json(updatedTrip);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update trip' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const tripId = Number(req.params.id);
    const { force } = req.query;

    const { rows: settingsRows } = await pool.query(
      "SELECT setting_value FROM admin_settings WHERE setting_key = 'trip_safety_enabled'"
    );
    const tripSafetyEnabled = settingsRows.length > 0 ? settingsRows[0].setting_value : true;

    const { rows: registrations } = await pool.query(
      'SELECT COUNT(*) as count FROM registrations WHERE trip_id = $1',
      [tripId]
    );

    const registrationCount = parseInt(registrations[0].count);

    if (tripSafetyEnabled && registrationCount > 0) {
      return res.status(409).json({
        error: 'Cannot delete trip with existing registrations',
        registrations: registrationCount,
        tripSafetyEnabled: true
      });
    }

    if (registrationCount > 0 && force !== 'true') {
      return res.status(409).json({
        error: 'Trip has registrations',
        registrations: registrationCount,
        requiresConfirmation: true,
        tripSafetyEnabled: false
      });
    }

    const { rows: [tripToDelete] } = await pool.query(
      'SELECT * FROM trips WHERE id = $1',
      [tripId]
    );

    if (!tripToDelete) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    await logActivity({
      tripId: tripId,
      actionType: 'TRIP_DELETED',
      description: `Deleted trip "${tripToDelete.name}" to ${tripToDelete.destination} (${registrationCount} registrations removed)`,
      performedBy: req.user.id,
      metadata: {
        tripName: tripToDelete.name,
        destination: tripToDelete.destination,
        deletedRegistrations: registrationCount
      }
    });

    if (registrationCount > 0) {
      await pool.query('DELETE FROM registrations WHERE trip_id = $1', [tripId]);
    }

    await pool.query('DELETE FROM trips WHERE id = $1', [tripId]);

    res.json({
      success: true,
      deleted: tripToDelete,
      deletedRegistrations: registrationCount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete trip' });
  }
});

router.get('/:id/registrations', async (req, res) => {
  try {
    const tripId = Number(req.params.id);

    const { rows } = await pool.query(
      `SELECT r.id as registration_id, r.registered_at,
              r.equipment_rental, r.helmet_rental, r.skill_level,
              r.emergency_contact_name, r.emergency_contact_phone,
              r.special_requests, r.terms_agreed,
              r.checked_in, r.check_in_response_at, r.moved_to_waitlist,
              r.filled_waiver_pdf_path,
              r.won_rental, r.won_ticket, r.waitlist_position,
              r.promotion_expires_at, r.promoted_from_waitlist_at,
              u.id as user_id, u.email, u.first_name, u.last_name
       FROM registrations r
       JOIN users u ON u.id = r.user_id
       WHERE r.trip_id = $1
       ORDER BY r.registered_at ASC`,
      [tripId]
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch registrations' });
  }
});

router.get('/:id/registrations/export', async (req, res) => {
  try {
    const tripId = Number(req.params.id);

    const { rows: registrations } = await pool.query(
      `SELECT r.registered_at,
              r.equipment_rental, r.helmet_rental, r.skill_level,
              r.emergency_contact_name, r.emergency_contact_phone,
              r.special_requests, r.terms_agreed,
              u.email, u.first_name, u.last_name,
              t.name as trip_name
       FROM registrations r
       JOIN users u ON u.id = r.user_id
       JOIN trips t ON t.id = r.trip_id
       WHERE r.trip_id = $1
       ORDER BY r.registered_at ASC`,
      [tripId]
    );

    if (registrations.length === 0) {
      return res.status(404).json({ error: 'No registrations found' });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${registrations[0].trip_name}_registrations.csv"`);

    const headers = [
      'Name', 'Email', 'Skill Level', 'Equipment Rental', 'Helmet Rental',
      'Emergency Contact Name', 'Emergency Contact Phone', 'Special Requests', 'Registered At'
    ];

    let csvContent = headers.join(',') + '\n';

    registrations.forEach(reg => {
      const row = [
        `"${(reg.first_name && reg.last_name) ? `${reg.first_name} ${reg.last_name}` : 'N/A'}"`,
        `"${reg.email}"`,
        `"${reg.skill_level}"`,
        `"${reg.equipment_rental}"`,
        reg.helmet_rental ? 'Yes' : 'No',
        `"${reg.emergency_contact_name}"`,
        `"${reg.emergency_contact_phone}"`,
        `"${(reg.special_requests || '').replace(/"/g, '""')}"`,
        `"${new Date(reg.registered_at).toLocaleString('en-US', { timeZone: 'America/New_York' })}"`
      ];
      csvContent += row.join(',') + '\n';
    });

    res.send(csvContent);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export registrations' });
  }
});

router.get('/:id/registrations/export-full', async (req, res) => {
  try {
    const tripId = Number(req.params.id);

    const { rows: [trip] } = await pool.query(
      'SELECT name FROM trips WHERE id = $1',
      [tripId]
    );

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const { rows: customQuestions } = await pool.query(
      `SELECT id, question_text
       FROM trip_custom_questions
       WHERE trip_id = $1
       ORDER BY display_order ASC`,
      [tripId]
    );

    const { rows: registrations } = await pool.query(
      `SELECT r.id, r.registered_at,
              r.equipment_rental, r.helmet_rental, r.skill_level,
              r.emergency_contact_name, r.emergency_contact_phone,
              r.special_requests,
              u.email, u.first_name, u.last_name
       FROM registrations r
       JOIN users u ON u.id = r.user_id
       WHERE r.trip_id = $1
       ORDER BY r.registered_at ASC`,
      [tripId]
    );

    const { rows: allAnswers } = await pool.query(
      `SELECT a.registration_id, a.question_id, a.answer_text
       FROM registration_custom_answers a
       JOIN registrations r ON r.id = a.registration_id
       WHERE r.trip_id = $1`,
      [tripId]
    );

    const answerMap = {};
    allAnswers.forEach(ans => {
      if (!answerMap[ans.registration_id]) {
        answerMap[ans.registration_id] = {};
      }
      answerMap[ans.registration_id][ans.question_id] = ans.answer_text;
    });

    const baseHeaders = [
      'Name', 'Email', 'Skill Level', 'Equipment Rental', 'Helmet Rental',
      'Emergency Contact Name', 'Emergency Contact Phone', 'Special Requests', 'Registered At'
    ];

    const customHeaders = customQuestions.map(q => q.question_text);
    const headers = [...baseHeaders, ...customHeaders];

    let csvContent = headers.map(h => `"${h}"`).join(',') + '\n';

    registrations.forEach(reg => {
      const baseRow = [
        `"${(reg.first_name && reg.last_name) ? `${reg.first_name} ${reg.last_name}` : 'N/A'}"`,
        `"${reg.email}"`,
        `"${reg.skill_level}"`,
        `"${reg.equipment_rental}"`,
        reg.helmet_rental ? 'Yes' : 'No',
        `"${reg.emergency_contact_name}"`,
        `"${reg.emergency_contact_phone}"`,
        `"${(reg.special_requests || '').replace(/"/g, '""')}"`,
        `"${new Date(reg.registered_at).toLocaleString('en-US', { timeZone: 'America/New_York' })}"`
      ];

      const customAnswers = customQuestions.map(q => {
        const answer = answerMap[reg.id]?.[q.id] || '';
        return `"${answer.replace(/"/g, '""')}"`;
      });

      csvContent += [...baseRow, ...customAnswers].join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${trip.name.replace(/[^a-z0-9]/gi, '_')}_full_registrations.csv"`);
    res.send(csvContent);

  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Failed to export registrations' });
  }
});

router.post('/:id/waiver', waiverUpload.single('waiver'), async (req, res) => {
  try {
    const tripId = Number(req.params.id);
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const relativePath = `waivers/${req.file.filename}`;

    const { rows } = await pool.query(
      'UPDATE trips SET waiver_pdf_path = $1 WHERE id = $2 RETURNING waiver_pdf_path',
      [relativePath, tripId]
    );

    res.json({ success: true, waiver_pdf_path: rows[0].waiver_pdf_path });
  } catch (err) {
    console.error('Waiver upload error:', err);
    res.status(500).json({ error: 'Failed to upload waiver' });
  }
});

router.delete('/:id/waiver', async (req, res) => {
  try {
    const tripId = Number(req.params.id);

    const { rows } = await pool.query('SELECT waiver_pdf_path FROM trips WHERE id = $1', [tripId]);
    if (rows.length > 0 && rows[0].waiver_pdf_path) {
      const fullPath = path.join(__dirname, '..', '..', '..', 'public_uploads', rows[0].waiver_pdf_path);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }

    await pool.query('UPDATE trips SET waiver_pdf_path = NULL WHERE id = $1', [tripId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Waiver delete error:', err);
    res.status(500).json({ error: 'Failed to delete waiver' });
  }
});

router.post('/:id/image', tripImageUpload.single('image'), async (req, res) => {
  try {
    const tripId = Number(req.params.id);
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    const newPath = `/public_uploads/trip-images/${req.file.filename}`;

    // Delete old uploaded image if it was a local file
    const { rows: existing } = await pool.query('SELECT image_url FROM trips WHERE id = $1', [tripId]);
    if (existing.length > 0 && existing[0].image_url && existing[0].image_url.includes('/trip-images/')) {
      const oldFile = path.join(__dirname, '..', '..', '..', 'public_uploads', 'trip-images', path.basename(existing[0].image_url));
      if (fs.existsSync(oldFile)) {
        fs.unlinkSync(oldFile);
      }
    }

    const { rows } = await pool.query(
      'UPDATE trips SET image_url = $1 WHERE id = $2 RETURNING image_url',
      [newPath, tripId]
    );

    res.json({ success: true, image_url: rows[0].image_url });
  } catch (err) {
    console.error('Trip image upload error:', err);
    res.status(500).json({ error: 'Failed to upload trip image' });
  }
});

router.post('/:id/giveaway', async (req, res) => {
  try {
    const tripId = Number(req.params.id);
    const { rental_count, ticket_count } = req.body;

    if (rental_count < 0 || ticket_count < 0) {
      return res.status(400).json({ error: 'Prize counts must be non-negative' });
    }

    if (rental_count === 0 && ticket_count === 0) {
      return res.status(400).json({ error: 'At least one prize type must be specified' });
    }

    // Find custom questions for rental and lift ticket raffles
    const { rows: raffleQuestions } = await pool.query(
      `SELECT id, question_text FROM trip_custom_questions
       WHERE trip_id = $1 AND (
         LOWER(TRIM(REPLACE(question_text, '*', ''))) = LOWER($2) OR
         LOWER(TRIM(REPLACE(question_text, '*', ''))) = LOWER($3)
       )`,
      [tripId, 'Would you like to be entered into the raffle for a free rental?', 'Would you like to be entered into the raffle for a free lift ticket?']
    );

    let rentalQuestionId = null;
    let ticketQuestionId = null;
    for (const q of raffleQuestions) {
      const cleaned = q.question_text.replace(/\*/g, '').trim().toLowerCase();
      if (cleaned === 'would you like to be entered into the raffle for a free rental?') rentalQuestionId = q.id;
      if (cleaned === 'would you like to be entered into the raffle for a free lift ticket?') ticketQuestionId = q.id;
    }

    // Get eligible registrations for rental raffle (only those who answered "Yes")
    const { rows: rentalEligible } = await pool.query(
      rentalQuestionId
        ? `SELECT r.id FROM registrations r
           JOIN registration_custom_answers a ON a.registration_id = r.id AND a.question_id = $2
           WHERE r.trip_id = $1 AND r.moved_to_waitlist = FALSE AND LOWER(TRIM(a.answer_text)) = 'yes'
           ORDER BY RANDOM()`
        : `SELECT r.id FROM registrations r
           WHERE r.trip_id = $1 AND r.moved_to_waitlist = FALSE
           ORDER BY RANDOM()`,
      rentalQuestionId ? [tripId, rentalQuestionId] : [tripId]
    );

    // Get eligible registrations for lift ticket raffle (only those who answered "Yes")
    const { rows: ticketEligible } = await pool.query(
      ticketQuestionId
        ? `SELECT r.id FROM registrations r
           JOIN registration_custom_answers a ON a.registration_id = r.id AND a.question_id = $2
           WHERE r.trip_id = $1 AND r.moved_to_waitlist = FALSE AND LOWER(TRIM(a.answer_text)) = 'yes'
           ORDER BY RANDOM()`
        : `SELECT r.id FROM registrations r
           WHERE r.trip_id = $1 AND r.moved_to_waitlist = FALSE
           ORDER BY RANDOM()`,
      ticketQuestionId ? [tripId, ticketQuestionId] : [tripId]
    );

    if (rental_count > 0 && rentalEligible.length === 0) {
      return res.status(400).json({ error: 'No eligible participants for the rental raffle. Make sure registrants answered "Yes" to the rental raffle question.' });
    }
    if (ticket_count > 0 && ticketEligible.length === 0) {
      return res.status(400).json({ error: 'No eligible participants for the lift ticket raffle. Make sure registrants answered "Yes" to the lift ticket raffle question.' });
    }
    if (rental_count > rentalEligible.length) {
      return res.status(400).json({
        error: `Not enough participants for rental raffle. ${rentalEligible.length} eligible but ${rental_count} prizes requested.`
      });
    }
    if (ticket_count > ticketEligible.length) {
      return res.status(400).json({
        error: `Not enough participants for lift ticket raffle. ${ticketEligible.length} eligible but ${ticket_count} prizes requested.`
      });
    }

    await pool.query(
      'UPDATE registrations SET won_rental = FALSE, won_ticket = FALSE WHERE trip_id = $1',
      [tripId]
    );

    let winners = [];

    if (rental_count > 0) {
      const rentalWinners = rentalEligible.slice(0, rental_count);
      for (const winner of rentalWinners) {
        await pool.query(
          'UPDATE registrations SET won_rental = TRUE WHERE id = $1',
          [winner.id]
        );
      }
      winners = [...rentalWinners];
    }

    if (ticket_count > 0) {
      const ticketWinners = ticketEligible.slice(0, ticket_count);
      for (const winner of ticketWinners) {
        await pool.query(
          'UPDATE registrations SET won_ticket = TRUE WHERE id = $1',
          [winner.id]
        );
      }
    }

    const { rows: winnerDetails } = await pool.query(
      `SELECT r.id, r.won_rental, r.won_ticket, u.first_name, u.last_name, u.email
       FROM registrations r
       JOIN users u ON u.id = r.user_id
       WHERE r.trip_id = $1 AND (r.won_rental = TRUE OR r.won_ticket = TRUE)
       ORDER BY u.last_name, u.first_name`,
      [tripId]
    );

    res.json({
      success: true,
      winners: winnerDetails,
      rental_winners: rental_count,
      ticket_winners: ticket_count
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to run giveaway' });
  }
});

router.post('/:id/manual-register', async (req, res) => {
  const client = await pool.connect();
  try {
    const tripId = Number(req.params.id);
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const { rows: [trip] } = await pool.query('SELECT * FROM trips WHERE id = $1', [tripId]);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const { rows: [user] } = await pool.query('SELECT id, first_name, last_name FROM users WHERE id = $1', [user_id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { rows: existing } = await pool.query(
      'SELECT id FROM registrations WHERE trip_id = $1 AND user_id = $2',
      [tripId, user_id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'User is already registered for this trip' });
    }

    await client.query('BEGIN');

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

    await client.query(
      `INSERT INTO registrations (
        trip_id, user_id, equipment_rental, helmet_rental,
        skill_level, emergency_contact_name, emergency_contact_phone,
        special_requests, terms_agreed, moved_to_waitlist, waitlist_position
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        tripId, user_id,
        'none',
        false,
        'intermediate',
        'N/A',
        'N/A',
        'Manually added by admin',
        true,
        addToWaitlist,
        waitlistPosition
      ]
    );

    await client.query('COMMIT');

    if (addToWaitlist) {
      res.json({
        success: true,
        status: 'waitlist',
        message: `${user.first_name} ${user.last_name} has been added to the waitlist.`
      });
    } else {
      res.json({
        success: true,
        status: 'confirmed',
        message: `${user.first_name} ${user.last_name} has been successfully registered for the trip.`
      });
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to manually register user' });
  } finally {
    client.release();
  }
});

router.get('/:id/attendance', async (req, res) => {
  try {
    const tripId = Number(req.params.id);

    const { rows: [trip] } = await pool.query(
      'SELECT id, name, destination, trip_date, departure_time FROM trips WHERE id = $1',
      [tripId]
    );

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const { rows: registrations } = await pool.query(
      `SELECT r.id as registration_id,
              r.moved_to_waitlist,
              r.physically_present,
              r.registered_at,
              u.id as user_id,
              u.email,
              u.first_name,
              u.last_name
       FROM registrations r
       JOIN users u ON u.id = r.user_id
       WHERE r.trip_id = $1
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [tripId]
    );

    const activeRegistrations = registrations.filter(r => !r.moved_to_waitlist);
    const waitlisted = registrations.filter(r => r.moved_to_waitlist);

    res.json({
      trip,
      attendance: {
        active: activeRegistrations,
        waitlisted: waitlisted
      },
      summary: {
        total_registered: registrations.length,
        active_count: activeRegistrations.length,
        waitlist_count: waitlisted.length,
        physically_present_count: registrations.filter(r => r.physically_present).length
      }
    });

  } catch (err) {
    console.error('Failed to fetch attendance:', err);
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

router.post('/:id/attendance/bulk', async (req, res) => {
  const client = await pool.connect();

  try {
    const tripId = Number(req.params.id);
    const { attendance_updates } = req.body;

    if (!Array.isArray(attendance_updates)) {
      return res.status(400).json({ error: 'attendance_updates must be an array' });
    }

    await client.query('BEGIN');

    for (const update of attendance_updates) {
      const { registration_id, physically_present } = update;

      if (typeof physically_present !== 'boolean') {
        throw new Error(`Invalid physically_present value for registration ${registration_id}`);
      }

      await client.query(
        `UPDATE registrations
         SET physically_present = $1
         WHERE id = $2 AND trip_id = $3`,
        [physically_present, registration_id, tripId]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, updated: attendance_updates.length });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to bulk update attendance:', err);
    res.status(500).json({ error: 'Failed to update attendance' });
  } finally {
    client.release();
  }
});

module.exports = router;
