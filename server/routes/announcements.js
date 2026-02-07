const express = require('express');
const router = express.Router();

const { pool } = require('../config');
const { logActivity } = require('../utils/logger');
const { adminRequired } = require('../middleware/auth');

router.get('/active', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, message, start_at, expires_at, recurrence_type
       FROM announcements
       WHERE is_active = TRUE
       ORDER BY start_at DESC`
    );

    let activeAnnouncement = null;
    const now = new Date();

    for (const ann of rows) {
        const start = new Date(ann.start_at);
        const end = new Date(ann.expires_at);

        if (now >= start && now <= end) {
            activeAnnouncement = ann;
            break;
        }

        if (now > end && ann.recurrence_type !== 'none') {
            let newStart = new Date(start);
            let newEnd = new Date(end);
            const durationMs = newEnd - newStart;

            while (newEnd < now) {
                if (ann.recurrence_type === 'daily') {
                    newStart.setDate(newStart.getDate() + 1);
                    newEnd = new Date(newStart.getTime() + durationMs);
                } else if (ann.recurrence_type === 'weekly') {
                    newStart.setDate(newStart.getDate() + 7);
                    newEnd = new Date(newStart.getTime() + durationMs);
                }
            }

            await pool.query(
                'UPDATE announcements SET start_at = $1, expires_at = $2 WHERE id = $3',
                [newStart, newEnd, ann.id]
            );

            if (now >= newStart && now <= newEnd) {
                activeAnnouncement = { ...ann, start_at: newStart, expires_at: newEnd };
                break;
            }
        }
    }

    res.json(activeAnnouncement);
  } catch (err) {
    console.error('Active announcement error:', err);
    res.status(500).json({ error: 'Failed' });
  }
});

router.get('/admin', adminRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.message, a.created_at, a.start_at, a.expires_at, a.is_active, a.recurrence_type,
              u.email as created_by_email, u.first_name, u.last_name
       FROM announcements a
       LEFT JOIN users u ON u.id = a.created_by
       ORDER BY a.start_at DESC
       LIMIT 50`
    );

    res.json(rows);
  } catch (err) {
    console.error('Failed to fetch announcements:', err);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

router.get('/', adminRequired, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.message, a.created_at, a.start_at, a.expires_at, a.is_active, a.recurrence_type,
              u.email as created_by_email, u.first_name, u.last_name
       FROM announcements a
       LEFT JOIN users u ON u.id = a.created_by
       ORDER BY a.start_at DESC
       LIMIT 50`
    );

    res.json(rows);
  } catch (err) {
    console.error('Failed to fetch announcements:', err);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

router.post('/admin', adminRequired, async (req, res) => {
  try {
    const { message, hours_duration, start_at, recurrence_type } = req.body;

    if (!message || message.trim().length === 0) return res.status(400).json({ error: 'Message required' });

    const startDate = start_at ? new Date(start_at) : new Date();

    const expiresAt = new Date(startDate);
    expiresAt.setHours(expiresAt.getHours() + Number(hours_duration || 24));

    const now = new Date();
    const isActive = startDate <= now;

    const { rows: [announcement] } = await pool.query(
      `INSERT INTO announcements (message, start_at, expires_at, recurrence_type, created_by, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [message.trim(), startDate, expiresAt, recurrence_type || 'none', req.user.id, isActive]
    );

    await logActivity({
      actionType: 'ANNOUNCEMENT_CREATED',
      description: `Created announcement: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`,
      performedBy: req.user.id,
      metadata: { message: message.trim(), isActive }
    });

    res.json(announcement);
  } catch (err) {
    console.error('Create announcement error:', err);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

router.post('/', adminRequired, async (req, res) => {
  try {
    const { message, hours_duration, start_at, recurrence_type } = req.body;

    if (!message || message.trim().length === 0) return res.status(400).json({ error: 'Message required' });

    const startDate = start_at ? new Date(start_at) : new Date();
    const expiresAt = new Date(startDate);
    expiresAt.setHours(expiresAt.getHours() + Number(hours_duration || 24));

    const now = new Date();
    const isActive = startDate <= now;

    const { rows: [announcement] } = await pool.query(
      `INSERT INTO announcements (message, start_at, expires_at, recurrence_type, created_by, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [message.trim(), startDate, expiresAt, recurrence_type || 'none', req.user.id, isActive]
    );

    await logActivity({
      actionType: 'ANNOUNCEMENT_CREATED',
      description: `Created announcement: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`,
      performedBy: req.user.id,
      metadata: { message: message.trim(), isActive }
    });

    res.json(announcement);
  } catch (err) {
    console.error('Create announcement error:', err);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

router.put('/admin/:id', adminRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { message, hours_duration, start_at, recurrence_type, is_active } = req.body;

    let updates = [];
    let values = [];
    let idx = 1;

    if (message !== undefined) {
        updates.push(`message = $${idx++}`);
        values.push(message);
    }
    if (recurrence_type !== undefined) {
        updates.push(`recurrence_type = $${idx++}`);
        values.push(recurrence_type);
    }
    if (is_active !== undefined) {
        updates.push(`is_active = $${idx++}`);
        values.push(is_active);
    }

    if (hours_duration !== undefined) {
        let startDateObj;
        if (start_at) {
            startDateObj = new Date(start_at);
            updates.push(`start_at = $${idx++}`);
            values.push(startDateObj);
        } else {
            const { rows } = await pool.query('SELECT start_at FROM announcements WHERE id = $1', [id]);
            if (rows.length) startDateObj = new Date(rows[0].start_at);
            else startDateObj = new Date();
        }

        const expiresAt = new Date(startDateObj);
        expiresAt.setHours(expiresAt.getHours() + Number(hours_duration));

        updates.push(`expires_at = $${idx++}`);
        values.push(expiresAt);
    }

    if (start_at && is_active === undefined) {
        const startDateObj = new Date(start_at);
        const now = new Date();
        const shouldBeActive = startDateObj <= now;
        updates.push(`is_active = $${idx++}`);
        values.push(shouldBeActive);
    }

    values.push(id);

    if (updates.length === 0) return res.json({ success: true });

    const { rows } = await pool.query(
        `UPDATE announcements SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
    );

    const updatedAnnouncement = rows[0];

    if (updatedAnnouncement) {
      await logActivity({
        actionType: 'ANNOUNCEMENT_UPDATED',
        description: `Updated announcement: "${updatedAnnouncement.message.substring(0, 50)}${updatedAnnouncement.message.length > 50 ? '...' : ''}"`,
        performedBy: req.user.id,
        metadata: { message: updatedAnnouncement.message, isActive: updatedAnnouncement.is_active }
      });
    }

    res.json(updatedAnnouncement || {});
  } catch (err) {
    console.error('Update announcement error:', err);
    res.status(500).json({ error: 'Failed to update' });
  }
});

router.delete('/admin/:id', adminRequired, async (req, res) => {
  try {
    const announcementId = Number(req.params.id);

    const { rows } = await pool.query(
      'DELETE FROM announcements WHERE id = $1 RETURNING *',
      [announcementId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    const deletedAnnouncement = rows[0];

    await logActivity({
      actionType: 'ANNOUNCEMENT_DELETED',
      description: `Deleted announcement: "${deletedAnnouncement.message.substring(0, 50)}${deletedAnnouncement.message.length > 50 ? '...' : ''}"`,
      performedBy: req.user.id,
      metadata: { message: deletedAnnouncement.message }
    });

    res.json({ success: true, deleted: deletedAnnouncement });
  } catch (err) {
    console.error('Failed to delete announcement:', err);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

router.put('/:id', adminRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { message, hours_duration, start_at, recurrence_type, is_active } = req.body;

    let updates = [];
    let values = [];
    let idx = 1;

    if (message !== undefined) {
        updates.push(`message = $${idx++}`);
        values.push(message);
    }
    if (recurrence_type !== undefined) {
        updates.push(`recurrence_type = $${idx++}`);
        values.push(recurrence_type);
    }
    if (is_active !== undefined) {
        updates.push(`is_active = $${idx++}`);
        values.push(is_active);
    }

    if (hours_duration !== undefined) {
        let startDateObj;
        if (start_at) {
            startDateObj = new Date(start_at);
            updates.push(`start_at = $${idx++}`);
            values.push(startDateObj);
        } else {
            const { rows } = await pool.query('SELECT start_at FROM announcements WHERE id = $1', [id]);
            if (rows.length) startDateObj = new Date(rows[0].start_at);
            else startDateObj = new Date();
        }

        const expiresAt = new Date(startDateObj);
        expiresAt.setHours(expiresAt.getHours() + Number(hours_duration));

        updates.push(`expires_at = $${idx++}`);
        values.push(expiresAt);
    }

    if (start_at && is_active === undefined) {
        const startDateObj = new Date(start_at);
        const now = new Date();
        const shouldBeActive = startDateObj <= now;
        updates.push(`is_active = $${idx++}`);
        values.push(shouldBeActive);
    }

    values.push(id);

    if (updates.length === 0) return res.json({ success: true });

    const { rows } = await pool.query(
        `UPDATE announcements SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
    );

    const updatedAnnouncement = rows[0];

    if (updatedAnnouncement) {
      await logActivity({
        actionType: 'ANNOUNCEMENT_UPDATED',
        description: `Updated announcement: "${updatedAnnouncement.message.substring(0, 50)}${updatedAnnouncement.message.length > 50 ? '...' : ''}"`,
        performedBy: req.user.id,
        metadata: { message: updatedAnnouncement.message, isActive: updatedAnnouncement.is_active }
      });
    }

    res.json(updatedAnnouncement || {});
  } catch (err) {
    console.error('Update announcement error:', err);
    res.status(500).json({ error: 'Failed to update' });
  }
});

router.delete('/:id', adminRequired, async (req, res) => {
  try {
    const announcementId = Number(req.params.id);

    const { rows } = await pool.query(
      'DELETE FROM announcements WHERE id = $1 RETURNING *',
      [announcementId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    const deletedAnnouncement = rows[0];

    await logActivity({
      actionType: 'ANNOUNCEMENT_DELETED',
      description: `Deleted announcement: "${deletedAnnouncement.message.substring(0, 50)}${deletedAnnouncement.message.length > 50 ? '...' : ''}"`,
      performedBy: req.user.id,
      metadata: { message: deletedAnnouncement.message }
    });

    res.json({ success: true, deleted: deletedAnnouncement });
  } catch (err) {
    console.error('Failed to delete announcement:', err);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

module.exports = router;
