const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const QRCode = require('qrcode');
const XLSX = require('xlsx');
const jwt = require('jsonwebtoken');

const { pool, APP_BASE_URL, JWT_SECRET } = require('../../config');
const { transporter, FROM } = require('../../utils/email');
const { adminRequired, authRequired } = require('../../middleware/auth');
const { excelUpload } = require('../../middleware/multer');

router.get('/qr/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const { rows } = await pool.query(
      'SELECT id FROM attendance_sessions WHERE qr_token = $1 AND is_active = TRUE',
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).send('Invalid or expired QR code');
    }

    const checkInUrl = `${APP_BASE_URL}/checkin/${token}`;

    const qrCode = await QRCode.toDataURL(checkInUrl, {
      errorCorrectionLevel: 'H',
      width: 400,
      margin: 2,
      color: {
        dark: '#000',
        light: '#ffffff'
      }
    });

    const base64Data = qrCode.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    res.setHeader('Content-Type', 'image/png');
    res.send(buffer);

  } catch (err) {
    console.error('QR generation error:', err);
    res.status(500).send('Failed to generate QR code');
  }
});

router.use(adminRequired);

router.post('/start-session', excelUpload.single('excel_file'), async (req, res) => {
  try {
    const { trip_id, bus_number } = req.body;

    if (!trip_id || !bus_number) {
      return res.status(400).json({ error: 'Trip ID and bus number are required' });
    }

    const busNum = parseInt(bus_number);
    if (![1, 2, 3].includes(busNum)) {
      return res.status(400).json({ error: 'Bus number must be 1, 2, or 3' });
    }

    const existing = await pool.query(
      'SELECT id FROM attendance_sessions WHERE trip_id = $1 AND bus_number = $2 AND is_active = TRUE',
      [trip_id, busNum]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'An active session already exists for this bus' });
    }

    const qrToken = crypto.randomBytes(32).toString('hex');

    const { rows: [session] } = await pool.query(
      `INSERT INTO attendance_sessions (trip_id, bus_number, qr_token, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [trip_id, busNum, qrToken, req.user.id]
    );

    if (req.file) {
      try {
        const workbook = XLSX.read(req.file.buffer);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);

        for (const row of data) {
          const busCol = Object.keys(row).find(k => k.toLowerCase() === 'bus');
          const firstCol = Object.keys(row).find(k => k.toLowerCase() === 'first');
          const lastCol = Object.keys(row).find(k => k.toLowerCase() === 'last');

          if (!busCol || !firstCol || !lastCol) continue;
          if (parseInt(row[busCol]) !== busNum) continue;

          const firstName = row[firstCol]?.toString().trim();
          const lastName = row[lastCol]?.toString().trim();

          if (!firstName || !lastName) continue;

          const userMatch = await pool.query(
            `SELECT id FROM users WHERE LOWER(first_name) = LOWER($1) AND LOWER(last_name) = LOWER($2)`,
            [firstName, lastName]
          );

          await pool.query(
            `INSERT INTO attendance_expected (session_id, first_name, last_name, matched_user_id)
             VALUES ($1, $2, $3, $4)`,
            [session.id, firstName, lastName, userMatch.rows[0]?.id || null]
          );
        }
      } catch (e) {
        console.error('Excel processing error:', e);
      }
    } else {
      try {
        const { rows: registeredUsers } = await pool.query(
          `SELECT u.id as user_id, u.first_name, u.last_name
           FROM registrations r
           JOIN users u ON u.id = r.user_id
           WHERE r.trip_id = $1
             AND r.moved_to_waitlist = FALSE`,
          [trip_id]
        );

        for (const user of registeredUsers) {
          await pool.query(
            `INSERT INTO attendance_expected (session_id, first_name, last_name, matched_user_id)
             VALUES ($1, $2, $3, $4)`,
            [session.id, user.first_name, user.last_name, user.user_id]
          );
        }
      } catch (dbError) {
        console.error('Database population error:', dbError);
      }
    }

    res.json(session);

  } catch (err) {
    console.error('Start session error:', err);
    res.status(500).json({ error: 'Failed to start attendance session' });
  }
});

router.post('/resume-session/:id', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);

    const { rows: [session] } = await pool.query(
      'SELECT trip_id, bus_number FROM attendance_sessions WHERE id = $1',
      [sessionId]
    );

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const { rows: conflicts } = await pool.query(
      'SELECT id FROM attendance_sessions WHERE trip_id = $1 AND bus_number = $2 AND is_active = TRUE',
      [session.trip_id, session.bus_number]
    );

    if (conflicts.length > 0) {
      return res.status(400).json({
        error: `Cannot resume. Bus ${session.bus_number} already has a different active session for this trip.`
      });
    }

    const { rows: [updated] } = await pool.query(
      `UPDATE attendance_sessions
       SET is_active = TRUE, ended_at = NULL
       WHERE id = $1
       RETURNING *`,
      [sessionId]
    );

    res.json(updated);

  } catch (err) {
    console.error('Resume session error:', err);
    res.status(500).json({ error: 'Failed to resume attendance session' });
  }
});

router.get('/sessions', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
        s.*,
        t.name as trip_name,
        t.trip_date,
        COUNT(DISTINCT c.id) as checkin_count
       FROM attendance_sessions s
       JOIN trips t ON t.id = s.trip_id
       LEFT JOIN attendance_checkins c ON c.session_id = s.id
       GROUP BY s.id, t.name, t.trip_date
       ORDER BY s.created_at DESC
       LIMIT 50`
    );

    res.json(rows);

  } catch (err) {
    console.error('Get sessions error:', err);
    res.status(500).json({ error: 'Failed to get attendance sessions' });
  }
});

router.get('/session/:id', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);

    const { rows: [session] } = await pool.query(
      'SELECT * FROM attendance_sessions WHERE id = $1',
      [sessionId]
    );

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const { rows: [trip] } = await pool.query(
      'SELECT * FROM trips WHERE id = $1',
      [session.trip_id]
    );

    const { rows: expected } = await pool.query(
      `SELECT ae.*,
              r.id as registration_id,
              r.physically_present
       FROM attendance_expected ae
       JOIN attendance_sessions s ON s.id = ae.session_id
       LEFT JOIN registrations r ON r.user_id = ae.matched_user_id AND r.trip_id = s.trip_id
       WHERE ae.session_id = $1
       ORDER BY ae.last_name, ae.first_name`,
      [sessionId]
    );

    const { rows: checkins } = await pool.query(
      'SELECT * FROM attendance_checkins WHERE session_id = $1 ORDER BY checked_in_at DESC',
      [sessionId]
    );

    res.json({
      session,
      trip,
      expected,
      checkins
    });

  } catch (err) {
    console.error('Get session error:', err);
    res.status(500).json({ error: 'Failed to get session details' });
  }
});

router.post('/end-session/:id', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);

    const { rows } = await pool.query(
      `UPDATE attendance_sessions
       SET is_active = FALSE, ended_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [sessionId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(rows[0]);

  } catch (err) {
    console.error('End session error:', err);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

router.post('/send-emails/:id', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);

    const { rows: [session] } = await pool.query(
      `SELECT s.*, t.name as trip_name, t.trip_date
       FROM attendance_sessions s
       JOIN trips t ON t.id = s.trip_id
       WHERE s.id = $1`,
      [sessionId]
    );

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (!session.is_active) {
      return res.status(400).json({ error: 'Session is not active' });
    }

    const { rows: expected } = await pool.query(
      `SELECT ae.*, u.email, u.id as user_id
       FROM attendance_expected ae
       LEFT JOIN users u ON u.id = ae.matched_user_id
       WHERE ae.session_id = $1
       ORDER BY ae.last_name, ae.first_name`,
      [sessionId]
    );

    if (expected.length === 0) {
      return res.status(400).json({ error: 'No passengers found for this session' });
    }

    const tripDate = new Date(session.trip_date).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });

    let emailsSent = 0;
    let emailsFailed = 0;

    for (const person of expected) {
      if (!person.email) {
        console.log(`Skipping ${person.first_name} ${person.last_name} - no email address`);
        continue;
      }

      try {
        const attendanceToken = jwt.sign(
          {
            sessionId: session.id,
            userId: person.user_id,
            firstName: person.first_name,
            lastName: person.last_name
          },
          JWT_SECRET,
          { expiresIn: '24h' }
        );

        const confirmLink = `${APP_BASE_URL}/api/attendance-bus/confirm/${attendanceToken}`;

        await transporter.sendMail({
          from: FROM,
          to: person.email,
          subject: `Bus Attendance: ${session.trip_name} - Bus ${session.bus_number}`,
          text: `Hi ${person.first_name},\n\nPlease confirm your attendance on Bus ${session.bus_number} for ${session.trip_name}.\n\nClick here to mark yourself as present:\n${confirmLink}\n\nSee you on the trip!\nUMD Ski Club`,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 40px 0;">
                    <table role="presentation" style="width: 600px; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                      <!-- Header -->
                      <tr>
                        <td style="background: linear-gradient(135deg, #e21833 0%, #a61528 100%); padding: 40px 30px; text-align: center;">
                          <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">
                            Bus Attendance
                          </h1>
                        </td>
                      </tr>

                      <!-- Content -->
                      <tr>
                        <td style="padding: 40px 30px;">
                          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                            Hi <strong>${person.first_name}</strong>,
                          </p>

                          <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                            Please confirm your attendance on <strong>Bus ${session.bus_number}</strong> for <strong>${session.trip_name}</strong> on <strong>${tripDate}</strong>.
                          </p>

                          <div style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; margin: 25px 0; border-radius: 4px;">
                            <p style="color: #2e7d32; margin: 0; font-size: 15px; font-weight: 600;">
                              Click the button below to mark yourself as present
                            </p>
                          </div>

                          <table role="presentation" style="margin: 30px auto; border-collapse: collapse;">
                            <tr>
                              <td style="border-radius: 8px; background: #e21833;">
                                <a href="${confirmLink}" style="display: inline-block; padding: 16px 40px; color: #ffffff; text-decoration: none; font-size: 18px; font-weight: 600; border-radius: 8px;">
                                  I'm Here - Mark Me Present
                                </a>
                              </td>
                            </tr>
                          </table>

                          <p style="color: #666; font-size: 14px; line-height: 1.6; margin: 25px 0 0 0; text-align: center;">
                            This is for bus attendance tracking purposes
                          </p>
                        </td>
                      </tr>

                      <tr>
                        <td style="background: #2c2c2c; padding: 25px 30px; text-align: center;">
                          <p style="color: rgba(255,255,255,0.7); font-size: 12px; margin: 0; line-height: 1.5;">
                            © ${new Date().getFullYear()} UMD Ski Club
                            <br>
                            Questions? Don't reply to this email. Contact us at umdskiclub@gmail.com
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
          `
        });

        emailsSent++;
        console.log(`✓ Sent attendance email to ${person.first_name} ${person.last_name} (${person.email})`);

      } catch (emailError) {
        emailsFailed++;
        console.error(`Failed to send attendance email to ${person.email}:`, emailError);
      }
    }

    res.json({
      success: true,
      emails_sent: emailsSent,
      emails_failed: emailsFailed,
      total_expected: expected.length
    });

  } catch (err) {
    console.error('Send attendance emails error:', err);
    res.status(500).json({ error: 'Failed to send attendance emails' });
  }
});

router.delete('/sessions', async (req, res) => {
  const client = await pool.connect();
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No sessions selected' });
    }

    await client.query('BEGIN');

    await client.query(
      'DELETE FROM attendance_checkins WHERE session_id = ANY($1)',
      [ids]
    );

    await client.query(
      'DELETE FROM attendance_expected WHERE session_id = ANY($1)',
      [ids]
    );

    const { rowCount } = await client.query(
      'DELETE FROM attendance_sessions WHERE id = ANY($1)',
      [ids]
    );

    await client.query('COMMIT');

    res.json({ success: true, deleted: rowCount });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Bulk delete sessions error:', err);
    res.status(500).json({ error: 'Failed to delete sessions' });
  } finally {
    client.release();
  }
});

module.exports = router;
