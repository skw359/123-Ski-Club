// Activity Logging Utility
// Central logging function for user and admin activities

const { pool } = require('../config');

/**
 * Logs user/registration activity with EST timestamp
 * @param {Object} params
 * @param {number} params.userId - The user affected by the action
 * @param {number} params.tripId - The trip involved
 * @param {string} params.actionType - Type of action (e.g., 'WAITLIST_MOVED', 'CHECKED_IN')
 * @param {string} params.description - Human-readable description
 * @param {number} params.performedBy - User ID who performed the action (optional, for admin actions)
 * @param {Object} params.metadata - Additional data (optional)
 */
async function logActivity({ userId, tripId, actionType, description, performedBy = null, metadata = null }) {
  try {
    await pool.query(
      `INSERT INTO activity_logs (user_id, trip_id, action_type, description, performed_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, tripId, actionType, description, performedBy, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}

module.exports = {
  logActivity,
};
