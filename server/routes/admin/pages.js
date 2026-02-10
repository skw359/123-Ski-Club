const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const { pool } = require('../../config');
const { logActivity } = require('../../utils/logger');
const { adminRequired } = require('../../middleware/auth');
const { pageImageUpload } = require('../../middleware/multer');
router.use(adminRequired);

router.get('/content', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM page_content ORDER BY content_key');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching page content:', err);
    res.status(500).json({ error: 'Failed to fetch page content' });
  }
});

router.put('/content/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO page_content (content_key, content_value, updated_at, updated_by)
       VALUES ($1, $2, NOW(), $3)
       ON CONFLICT (content_key)
       DO UPDATE SET content_value = $2, updated_at = NOW(), updated_by = $3
       RETURNING *`,
      [key, value, req.user.id]
    );

    await logActivity({
      actionType: 'PAGE_CONTENT_UPDATED',
      description: `Updated page content: ${key}`,
      performedBy: req.user.id,
      metadata: { key, value }
    });

    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating page content:', err);
    res.status(500).json({ error: 'Failed to update page content' });
  }
});

router.post('/content/upload-image', pageImageUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const { key } = req.body;
    if (!key) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Content key is required' });
    }

    const newPath = `/public_uploads/page-images/${req.file.filename}`;

    const { rows: existing } = await pool.query(
      'SELECT content_value FROM page_content WHERE content_key = $1',
      [key]
    );

    if (existing.length > 0 && existing[0].content_value) {
      const oldPath = existing[0].content_value;
      if (oldPath.includes('/page-images/')) {
        const fullOldPath = path.join(__dirname, '..', '..', '..', 'public_uploads', 'page-images', path.basename(oldPath));
        if (fs.existsSync(fullOldPath)) {
          fs.unlinkSync(fullOldPath);
        }
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO page_content (content_key, content_value, content_type, updated_at, updated_by)
       VALUES ($1, $2, 'image', NOW(), $3)
       ON CONFLICT (content_key)
       DO UPDATE SET content_value = $2, content_type = 'image', updated_at = NOW(), updated_by = $3
       RETURNING *`,
      [key, newPath, req.user.id]
    );

    await logActivity({
      actionType: 'PAGE_IMAGE_UPLOADED',
      description: `Uploaded image for: ${key}`,
      performedBy: req.user.id,
      metadata: { key, path: newPath }
    });

    res.json(rows[0]);
  } catch (err) {
    console.error('Error uploading page image:', err);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

router.get('/faqs', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM faqs ORDER BY category_order, sort_order');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching FAQs:', err);
    res.status(500).json({ error: 'Failed to fetch FAQs' });
  }
});

router.put('/faqs/reorder', async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Items array is required' });
    }

    for (const item of items) {
      await pool.query(
        'UPDATE faqs SET sort_order = $1, category_order = $2, updated_at = NOW() WHERE id = $3',
        [item.sort_order, item.category_order, item.id]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error reordering FAQs:', err);
    res.status(500).json({ error: 'Failed to reorder FAQs' });
  }
});

router.post('/faqs', async (req, res) => {
  try {
    const { category, question, answer, sort_order, category_order } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO faqs (category, question, answer, sort_order, category_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [category, question, answer, sort_order || 0, category_order || 0]
    );

    await logActivity({
      actionType: 'FAQ_CREATED',
      description: `Created FAQ: "${question.substring(0, 50)}..."`,
      performedBy: req.user.id,
      metadata: { faqId: rows[0].id, category }
    });

    res.json(rows[0]);
  } catch (err) {
    console.error('Error creating FAQ:', err);
    res.status(500).json({ error: 'Failed to create FAQ' });
  }
});

router.put('/faqs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { category, question, answer, sort_order, category_order } = req.body;

    const { rows } = await pool.query(
      `UPDATE faqs SET category = $1, question = $2, answer = $3, sort_order = $4, category_order = $5, updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [category, question, answer, sort_order || 0, category_order || 0, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'FAQ not found' });
    }

    await logActivity({
      actionType: 'FAQ_UPDATED',
      description: `Updated FAQ #${id}: "${question.substring(0, 50)}..."`,
      performedBy: req.user.id,
      metadata: { faqId: id, category }
    });

    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating FAQ:', err);
    res.status(500).json({ error: 'Failed to update FAQ' });
  }
});

router.delete('/faqs/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query('DELETE FROM faqs WHERE id = $1 RETURNING *', [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'FAQ not found' });
    }

    await logActivity({
      actionType: 'FAQ_DELETED',
      description: `Deleted FAQ #${id}: "${rows[0].question.substring(0, 50)}..."`,
      performedBy: req.user.id,
      metadata: { faqId: id, category: rows[0].category }
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting FAQ:', err);
    res.status(500).json({ error: 'Failed to delete FAQ' });
  }
});

module.exports = router;
