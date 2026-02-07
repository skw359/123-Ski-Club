const express = require('express');
const router = express.Router();

const { pool } = require('../config');
const { adminRequired } = require('../middleware/auth');

router.get('/trips/:id/questions', async (req, res) => {
  try {
    const tripId = Number(req.params.id);

    const { rows } = await pool.query(
      `SELECT id, question_text, question_type, dropdown_options, is_required, display_order
       FROM trip_custom_questions
       WHERE trip_id = $1
       ORDER BY display_order ASC`,
      [tripId]
    );

    const questions = rows.map(q => ({
      ...q,
      dropdown_options: q.dropdown_options ? JSON.parse(q.dropdown_options) : null
    }));

    res.json(questions);
  } catch (err) {
    console.error('Failed to fetch custom questions:', err);
    res.status(500).json({ error: 'Failed to fetch custom questions' });
  }
});

router.put('/admin/trips/:id/questions', adminRequired, async (req, res) => {
  const client = await pool.connect();

  try {
    const tripId = Number(req.params.id);
    const { questions } = req.body;

    if (!Array.isArray(questions)) {
      return res.status(400).json({ error: 'Questions must be an array' });
    }

    if (questions.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 custom questions allowed per trip' });
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];

      if (!q.question_text || q.question_text.trim().length === 0) {
        return res.status(400).json({ error: `Question ${i + 1}: Question text is required` });
      }

      if (q.question_text.length > 120) {
        return res.status(400).json({ error: `Question ${i + 1}: Question text must be 120 characters or less` });
      }

      if (!['text', 'dropdown'].includes(q.question_type)) {
        return res.status(400).json({ error: `Question ${i + 1}: Invalid question type` });
      }

      if (q.question_type === 'dropdown') {
        if (!Array.isArray(q.dropdown_options) || q.dropdown_options.length === 0) {
          return res.status(400).json({ error: `Question ${i + 1}: Dropdown questions must have at least one option` });
        }

        if (q.dropdown_options.length > 20) {
          return res.status(400).json({ error: `Question ${i + 1}: Maximum 20 dropdown options allowed` });
        }

        const validOptions = q.dropdown_options.filter(opt => opt && opt.trim().length > 0);
        if (validOptions.length === 0) {
          return res.status(400).json({ error: `Question ${i + 1}: At least one non-empty dropdown option required` });
        }
      }
    }

    await client.query('BEGIN');

    const { rows: existingQuestions } = await client.query(
      'SELECT id, question_text, question_type, dropdown_options, is_required, display_order FROM trip_custom_questions WHERE trip_id = $1 ORDER BY display_order',
      [tripId]
    );

    const existingIds = new Set(existingQuestions.map(q => q.id));
    const newQuestionIds = new Set(questions.filter(q => q.id).map(q => q.id));

    const idsToDelete = [...existingIds].filter(id => !newQuestionIds.has(id));
    if (idsToDelete.length > 0) {
      await client.query(
        'DELETE FROM trip_custom_questions WHERE id = ANY($1)',
        [idsToDelete]
      );
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const dropdownOptions = q.question_type === 'dropdown'
        ? JSON.stringify(q.dropdown_options.filter(opt => opt && opt.trim().length > 0))
        : null;

      if (q.id && existingIds.has(q.id)) {
        await client.query(
          `UPDATE trip_custom_questions
           SET question_text = $1, question_type = $2, dropdown_options = $3,
               is_required = $4, display_order = $5
           WHERE id = $6`,
          [q.question_text.trim(), q.question_type, dropdownOptions, q.is_required !== false, i, q.id]
        );
      } else {
        await client.query(
          `INSERT INTO trip_custom_questions
           (trip_id, question_text, question_type, dropdown_options, is_required, display_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [tripId, q.question_text.trim(), q.question_type, dropdownOptions, q.is_required !== false, i]
        );
      }
    }

    await client.query('COMMIT');

    res.json({ success: true, message: 'Custom questions saved successfully' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to save custom questions:', err);
    res.status(500).json({ error: 'Failed to save custom questions' });
  } finally {
    client.release();
  }
});

module.exports = router;
