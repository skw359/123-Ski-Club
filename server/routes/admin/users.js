const express = require('express');
const router = express.Router();

const { pool } = require('../../config');
const { logActivity } = require('../../utils/logger');
const { adminRequired } = require('../../middleware/auth');

router.use(adminRequired);

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '' } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '';
    let queryParams = [];

    if (search) {
      whereClause = 'WHERE (u.email ILIKE $1 OR u.first_name ILIKE $1 OR u.last_name ILIKE $1)';
      queryParams.push(`%${search}%`);
    }

    queryParams.push(limit);
    queryParams.push(offset);

    const limitIndex = search ? '$2' : '$1';
    const offsetIndex = search ? '$3' : '$2';

    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.created_at, u.strike_count,
              COUNT(r.id) as trip_count,
              MAX(r.registered_at) as last_registration,
              EXISTS (
                SELECT 1 FROM magic_link_tokens m
                WHERE m.user_id = u.id AND m.used_at IS NOT NULL
              ) as is_verified
       FROM users u
       LEFT JOIN registrations r ON r.user_id = u.id
       ${whereClause}
       GROUP BY u.id, u.email, u.first_name, u.last_name, u.created_at, u.strike_count
       ORDER BY u.created_at DESC
       LIMIT ${limitIndex} OFFSET ${offsetIndex}`,
      queryParams
    );

    const { rows: [{ total }] } = await pool.query(
      `SELECT COUNT(DISTINCT u.id) as total FROM users u ${whereClause}`,
      search ? [`%${search}%`] : []
    );

    res.json({
      users: rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: Number(total),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.post('/:id/strike', async (req, res) => {
  try {
    const userId = Number(req.params.id);

    const { rows: [user] } = await pool.query(
      'SELECT email, first_name, last_name, strike_count FROM users WHERE id = $1',
      [userId]
    );

    await pool.query(
      'UPDATE users SET strike_count = strike_count + 1 WHERE id = $1',
      [userId]
    );

    if (user) {
      await logActivity({
        userId: userId,
        actionType: 'STRIKE_ADDED',
        description: `Added strike to ${user.first_name} ${user.last_name} (${user.email}) - now has ${user.strike_count + 1} strike(s)`,
        performedBy: req.user.id,
        metadata: { userEmail: user.email, newStrikeCount: user.strike_count + 1 }
      });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add strike' });
  }
});

router.delete('/:id/strike', async (req, res) => {
  try {
    const userId = Number(req.params.id);

    const { rows: [user] } = await pool.query(
      'SELECT email, first_name, last_name, strike_count FROM users WHERE id = $1',
      [userId]
    );

    await pool.query(
      'UPDATE users SET strike_count = GREATEST(strike_count - 1, 0) WHERE id = $1',
      [userId]
    );

    if (user) {
      const newCount = Math.max(user.strike_count - 1, 0);
      await logActivity({
        userId: userId,
        actionType: 'STRIKE_REMOVED',
        description: `Removed strike from ${user.first_name} ${user.last_name} (${user.email}) - now has ${newCount} strike(s)`,
        performedBy: req.user.id,
        metadata: { userEmail: user.email, newStrikeCount: newCount }
      });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove strike' });
  }
});

router.post('/:id/strikes/clear', async (req, res) => {
  try {
    const userId = Number(req.params.id);

    const { rows: [user] } = await pool.query(
      'SELECT email, first_name, last_name, strike_count FROM users WHERE id = $1',
      [userId]
    );

    await pool.query(
      'UPDATE users SET strike_count = 0 WHERE id = $1',
      [userId]
    );

    if (user && user.strike_count > 0) {
      await logActivity({
        userId: userId,
        actionType: 'STRIKES_CLEARED',
        description: `Cleared all ${user.strike_count} strike(s) from ${user.first_name} ${user.last_name} (${user.email})`,
        performedBy: req.user.id,
        metadata: { userEmail: user.email, previousStrikeCount: user.strike_count }
      });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear strikes' });
  }
});

module.exports = router;
