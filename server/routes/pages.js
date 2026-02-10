const express = require('express');
const router = express.Router();

const { pool } = require('../config');

router.get('/page-content', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT content_key, content_value, content_type FROM page_content');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching page content:', err);
    res.status(500).json({ error: 'Failed to fetch page content' });
  }
});

router.get('/faqs', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, category, question, answer, sort_order, category_order FROM faqs ORDER BY category_order, sort_order'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching FAQs:', err);
    res.status(500).json({ error: 'Failed to fetch FAQs' });
  }
});

module.exports = router;
