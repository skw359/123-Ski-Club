const jwt = require('jsonwebtoken');
const { JWT_SECRET, pool } = require('../config');

const isUmdEmail = (email) => {
  if (typeof email !== 'string') return false;
  const lower = email.toLowerCase();
  return lower.endsWith('@terpmail.umd.edu') || lower.endsWith('@umd.edu');
};

const signSession = (payload) =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: '120d' });

const verifySession = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
};

async function areExternalEmailsAllowed() {
  try {
    const { rows } = await pool.query(
      "SELECT setting_value FROM admin_settings WHERE setting_key = 'allow_external_emails'"
    );
    return rows.length > 0 && rows[0].setting_value === true;
  } catch (err) {
    console.error('Error checking external email setting:', err);
    return false;
  }
}

module.exports = {
  isUmdEmail,
  signSession,
  verifySession,
  areExternalEmailsAllowed,
};
