// ──────────────────────────────────────────────────────────────────────────────
// Admin Settings Routes
// External emails and trip safety settings
// ──────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();

const { pool } = require('../../config');
const { logActivity } = require('../../utils/logger');
const { adminRequired } = require('../../middleware/auth');
const { areExternalEmailsAllowed } = require('../../utils/helpers');

// All routes in this file require admin auth
router.use(adminRequired);

// Get external email setting
router.get('/external-emails', async (req, res) => {
  try {
    const enabled = await areExternalEmailsAllowed();
    res.json({ enabled });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

// Update external email setting
router.put('/external-emails', async (req, res) => {
  try {
    const { enabled } = req.body;

    await pool.query(
      `INSERT INTO admin_settings (setting_key, setting_value, updated_by)
       VALUES ('allow_external_emails', $1, $2)
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = $1, updated_at = NOW(), updated_by = $2`,
      [enabled, req.user.id]
    );

    // Log the setting change
    await logActivity({
      actionType: 'SETTING_CHANGED',
      description: `Changed "External Emails" setting to ${enabled ? 'ENABLED' : 'DISABLED'}`,
      performedBy: req.user.id,
      metadata: { settingKey: 'allow_external_emails', newValue: enabled }
    });

    res.json({ success: true, enabled });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// Get trip safety setting
router.get('/trip-safety', async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT setting_value FROM admin_settings WHERE setting_key = 'trip_safety_enabled'"
    );

    const enabled = rows.length > 0 ? rows[0].setting_value : true;
    res.json({ enabled });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch trip safety setting' });
  }
});

// Update trip safety setting
router.put('/trip-safety', async (req, res) => {
  try {
    const { enabled } = req.body;

    await pool.query(
      `INSERT INTO admin_settings (setting_key, setting_value, updated_by)
       VALUES ('trip_safety_enabled', $1, $2)
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = $1, updated_at = NOW(), updated_by = $2`,
      [enabled, req.user.id]
    );

    // Log the setting change
    await logActivity({
      actionType: 'SETTING_CHANGED',
      description: `Changed "Trip Safety" setting to ${enabled ? 'ENABLED' : 'DISABLED'}`,
      performedBy: req.user.id,
      metadata: { settingKey: 'trip_safety_enabled', newValue: enabled }
    });

    res.json({ success: true, enabled });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update trip safety setting' });
  }
});

module.exports = router;
