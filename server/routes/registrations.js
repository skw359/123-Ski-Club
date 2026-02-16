const express = require('express');
const router = express.Router();

const { pool } = require('../config');
const { authRequired } = require('../middleware/auth');
const { waiverUpload } = require('../middleware/multer');

router.post('/:id/waiver', authRequired, waiverUpload.single('waiver'), async (req, res) => {
  try {
    const regId = Number(req.params.id);
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { rows: regRows } = await pool.query(
      'SELECT user_id FROM registrations WHERE id = $1',
      [regId]
    );

    if (regRows.length === 0) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    if (regRows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const relativePath = `waivers/${req.file.filename}`;

    await pool.query(
      'UPDATE registrations SET filled_waiver_pdf_path = $1 WHERE id = $2',
      [relativePath, regId]
    );

    res.json({ success: true, filled_waiver_pdf_path: relativePath });
  } catch (err) {
    console.error('Filled waiver upload error:', err);
    res.status(500).json({ error: 'Failed to upload waiver' });
  }
});

router.delete('/:id', authRequired, async (req, res) => {
  try {
    const regId = Number(req.params.id);

    const { rows: [reg] } = await pool.query(
      'SELECT r.trip_id, r.moved_to_waitlist, t.name as trip_name FROM registrations r JOIN trips t ON t.id = r.trip_id WHERE r.id = $1 AND r.user_id = $2',
      [regId, req.user.id]
    );

    if (!reg) return res.status(404).json({ error: 'Registration not found' });

    const { rowCount } = await pool.query(
      'DELETE FROM registrations WHERE id = $1 AND user_id = $2',
      [regId, req.user.id]
    );

    if (rowCount > 0) {
      const { logActivity } = require('../utils/logger');
      await logActivity({
        userId: req.user.id,
        tripId: reg.trip_id,
        actionType: 'USER_CANCELLED',
        description: `Cancelled ${reg.moved_to_waitlist ? 'waitlist' : 'active'} registration for ${reg.trip_name}`,
        metadata: { tripName: reg.trip_name, wasOnWaitlist: reg.moved_to_waitlist }
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Cancellation error:', err);
    res.status(500).json({ error: 'Cancellation failed' });
  }
});

module.exports = router;
