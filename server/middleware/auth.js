const path = require('path');
const { pool } = require('../config');
const { verifySession } = require('../utils/helpers');

const authRequired = async (req, res, next) => {
  const token = req.cookies.session;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  const data = verifySession(token);
  if (!data) return res.status(401).json({ error: 'Invalid session' });
  req.user = data;
  next();
};

const adminRequired = async (req, res, next) => {
  const token = req.cookies.session;
  if (!token) {
    return res
      .status(401)
      .sendFile(path.join(__dirname, '..', '..', 'public_dist', 'authentication-required.html'));
  }

  const data = verifySession(token);
  if (!data) return res.status(401).json({ error: 'Invalid session' });

  const { rows } = await pool.query(
    'SELECT id, email, is_admin FROM users WHERE id = $1',
    [data.id]
  );

  if (rows.length === 0) {
    return res.status(401).json({ error: 'User not found' });
  }

  if (!rows[0].is_admin) {
    return res
      .status(403)
      .sendFile(path.join(__dirname, '..', '..', 'public_dist', 'admin-access-required.html'));
  }

  req.admin = rows[0];
  req.user = data;
  next();
};

module.exports = {
  authRequired,
  adminRequired,
};
