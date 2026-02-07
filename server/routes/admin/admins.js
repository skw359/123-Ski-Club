// ──────────────────────────────────────────────────────────────────────────────
// Admin Management Routes
// Get all admins, add new admins, remove admin privileges
// ──────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();

const { pool } = require('../../config');
const { isUmdEmail } = require('../../utils/helpers');
const { adminRequired } = require('../../middleware/auth');

// All routes in this file require admin auth
router.use(adminRequired);

// Get all admins
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, first_name, last_name, created_at
       FROM users
       WHERE is_admin = true
       ORDER BY created_at ASC`
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch admins' });
  }
});

// Add new admin
router.post('/', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (!isUmdEmail(email)) {
      return res.status(400).json({ error: 'Email must end with @terpmail.umd.edu or @umd.edu' });
    }

    const lowerEmail = email.toLowerCase();

    // Check if user exists
    const { rows: existingUsers } = await pool.query(
      'SELECT id, email, is_admin FROM users WHERE LOWER(email) = LOWER($1)',
      [lowerEmail]
    );

    if (existingUsers.length === 0) {
      return res.status(404).json({
        error: 'User not found. The user must register on the site first before being made an admin.'
      });
    }

    const user = existingUsers[0];

    if (user.is_admin) {
      return res.status(409).json({ error: 'User is already an admin' });
    }

    // Update user to admin
    await pool.query(
      'UPDATE users SET is_admin = true WHERE id = $1',
      [user.id]
    );

    res.json({
      success: true,
      message: `${email} has been granted admin privileges`,
      user: {
        id: user.id,
        email: user.email
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add admin' });
  }
});

// Remove admin privileges
router.delete('/:id', async (req, res) => {
  try {
    const adminId = Number(req.params.id);

    // Prevent users from removing their own admin privileges
    if (adminId === req.user.id) {
      return res.status(409).json({ error: 'You cannot remove your own admin privileges' });
    }

    // Check if user exists and is admin
    const { rows: existingUsers } = await pool.query(
      'SELECT id, email, is_admin FROM users WHERE id = $1',
      [adminId]
    );

    if (existingUsers.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = existingUsers[0];

    if (!user.is_admin) {
      return res.status(409).json({ error: 'User is not an admin' });
    }

    // Check that there will be at least one admin remaining
    const { rows: adminCountResult } = await pool.query(
      'SELECT COUNT(*) as count FROM users WHERE is_admin = true'
    );

    if (Number(adminCountResult[0].count) <= 1) {
      return res.status(409).json({
        error: 'Cannot remove the last admin. There must be at least one admin.'
      });
    }

    // Remove admin privileges
    await pool.query(
      'UPDATE users SET is_admin = false WHERE id = $1',
      [adminId]
    );

    res.json({
      success: true,
      message: `Admin privileges removed from ${user.email}`
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to remove admin' });
  }
});

module.exports = router;
