// ──────────────────────────────────────────────────────────────────────────────
// Admin PDF Management Routes
// Upload, check status, and delete general PDFs (like canva.pdf)
// ──────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const { pool } = require('../../config');
const { logActivity } = require('../../utils/logger');
const { adminRequired } = require('../../middleware/auth');
const { upload } = require('../../middleware/multer');
const multer = require('multer');

// All routes in this file require admin auth
router.use(adminRequired);

// Check PDF status
router.get('/status', async (req, res) => {
  try {
    const pdfPath = path.join(__dirname, '..', '..', '..', 'public_uploads', 'canva.pdf');

    // Check if file exists
    const exists = fs.existsSync(pdfPath);

    if (!exists) {
      return res.json({ exists: false });
    }

    // Get file stats
    const stats = fs.statSync(pdfPath);

    // Try to get PDF metadata from database
    const { rows } = await pool.query(
      'SELECT description, uploaded_at FROM pdf_metadata ORDER BY uploaded_at DESC LIMIT 1'
    );

    const metadata = rows[0] || {};

    res.json({
      exists: true,
      size: stats.size,
      uploadedAt: metadata.uploaded_at || stats.mtime,
      description: metadata.description || null
    });

  } catch (err) {
    console.error('PDF status check error:', err);
    res.status(500).json({ error: 'Failed to check PDF status' });
  }
});

// Upload new PDF
router.post('/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file provided' });
    }

    const description = req.body.description || null;

    // Store metadata in database
    await pool.query(
      'INSERT INTO pdf_metadata (description, uploaded_at, uploaded_by) VALUES ($1, NOW(), $2)',
      [description, req.user.id]
    );

    // Log PDF upload
    await logActivity({
      actionType: 'PDF_UPLOADED',
      description: `Uploaded PDF document "canva.pdf" to Information page${description ? ` - ${description}` : ''}`,
      performedBy: req.user.id,
      metadata: { filename: 'canva.pdf', size: req.file.size, description }
    });

    res.json({
      success: true,
      message: 'PDF uploaded successfully',
      filename: 'canva.pdf',
      size: req.file.size
    });

  } catch (err) {
    console.error('PDF upload error:', err);
    res.status(500).json({ error: 'Failed to upload PDF' });
  }
});

// Delete PDF
router.delete('/', async (req, res) => {
  try {
    const pdfPath = path.join(__dirname, '..', '..', '..', 'public_uploads', 'canva.pdf');

    // Check if file exists
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({ error: 'PDF file not found' });
    }

    // Delete the file
    fs.unlinkSync(pdfPath);

    // Record deletion in database
    await pool.query(
      'INSERT INTO pdf_metadata (description, uploaded_at, uploaded_by) VALUES ($1, NOW(), $2)',
      ['PDF deleted', req.user.id]
    );

    // Log PDF deletion
    await logActivity({
      actionType: 'PDF_DELETED',
      description: 'Deleted PDF document "canva.pdf" from Information page',
      performedBy: req.user.id,
      metadata: { filename: 'canva.pdf' }
    });

    res.json({
      success: true,
      message: 'PDF deleted successfully'
    });

  } catch (err) {
    console.error('PDF deletion error:', err);
    res.status(500).json({ error: 'Failed to delete PDF' });
  }
});

// Handle multer errors
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 100MB.' });
    }
  }

  if (error.message === 'Only PDF files are allowed') {
    return res.status(400).json({ error: 'Only PDF files are allowed' });
  }

  next(error);
});

module.exports = router;
