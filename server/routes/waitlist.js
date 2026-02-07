const express = require('express');
const router = express.Router();

const { pool, APP_BASE_URL } = require('../config');
const { transporter, FROM } = require('../utils/email');
const { logActivity } = require('../utils/logger');
const { adminRequired } = require('../middleware/auth');

let automationRunning = false;

async function runAutomation() {
  // Prevent concurrent execution - if automation is already running, skip this call
  if (automationRunning) {
    console.log('Automation already running, skipping this call to prevent duplicate promotions');
    return;
  }

  automationRunning = true;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const now = new Date();

    const { rows: tripsWithSpace } = await client.query(`
      SELECT t.id, t.name, t.capacity, COUNT(r.id) as current_count
      FROM trips t
      LEFT JOIN registrations r ON r.trip_id = t.id AND r.moved_to_waitlist = FALSE
      WHERE t.trip_date > NOW()
      GROUP BY t.id
      HAVING COUNT(r.id) < t.capacity
    `);

    for (const trip of tripsWithSpace) {
      const spotsAvailable = trip.capacity - trip.current_count;

      console.log(`[AUTOMATION] Trip "${trip.name}" - Capacity: ${trip.capacity}, Current: ${trip.current_count}, Available: ${spotsAvailable}`);

      if (spotsAvailable > 0) {
        const { rows: nextInLine } = await client.query(`
          SELECT r.id, r.user_id, u.email, u.first_name
          FROM registrations r
          JOIN users u ON u.id = r.user_id
          WHERE r.trip_id = $1 AND r.moved_to_waitlist = TRUE
          ORDER BY COALESCE(r.waitlist_position, 999999) ASC, r.registered_at ASC
          LIMIT $2
        `, [trip.id, spotsAvailable]);

        console.log(`[AUTOMATION] Found ${nextInLine.length} people to promote (LIMIT was ${spotsAvailable})`);

        for (const person of nextInLine) {
          const deadline = new Date(now.getTime() + 20 * 60 * 60 * 1000);
          const deadlineStr = deadline.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

          console.log(`Promoting ${person.email} from waitlist. Deadline: ${deadline}`);

          await client.query(`
            UPDATE registrations
            SET moved_to_waitlist = FALSE,
                promotion_expires_at = $1,
                waitlist_position = NULL
            WHERE id = $2
          `, [deadline, person.id]);

          try {
            await transporter.sendMail({
              from: FROM,
              to: person.email,
              subject: `OFF WAITLIST: You're up for ${trip.name}!`,
              text: `A spot opened up! You have 20 hours (until ${deadlineStr}) to log in and confirm your spot, or it will go to the next person.`,
              html: `
              <!DOCTYPE html>
              <html lang="en">
              <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>You're off the waitlist!</title>
              </head>
              <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f5f5f5;">
                  <tr>
                    <td align="center" style="padding: 40px 20px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); overflow: hidden;">

                        <tr>
                          <td style="background: linear-gradient(135deg, #e03a3e 0%, #d32f2f 100%); padding: 30px 40px; text-align: center;">
                            <div style="color: white; font-size: 28px; font-weight: 700; margin-bottom: 8px; letter-spacing: -0.5px;">
                              UMD Ski Club
                            </div>
                            <div style="color: rgba(255,255,255,0.9); font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 2px;">
                              University of Maryland
                            </div>
                          </td>
                        </tr>

                        <tr>
                          <td style="padding: 40px;">
                            <div style="text-align: center; margin-bottom: 32px;">
                              <div style="display: inline-block; background-color: rgba(224, 58, 62, 0.1); padding: 16px; border-radius: 50%; margin-bottom: 20px;">
                                <div style="width: 32px; height: 32px; background-color: #e03a3e; border-radius: 4px; position: relative; margin: 0 auto;">
                                  <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; font-size: 18px; font-weight: bold;"></div>
                                </div>
                              </div>
                              <h1 style="color: #2c2c2c; font-size: 24px; font-weight: 600; margin: 0 0 12px 0; line-height: 1.3;">
                                You're off the waitlist!
                              </h1>
                              <p style="color: #666666; font-size: 16px; margin: 0; line-height: 1.5;">
                                Hi ${person.first_name || 'there'},<br><br>
                                A spot just opened up for <strong style="color: #2c2c2c;">${trip.name}</strong> and you're next in line!
                              </p>
                            </div>

                            <!-- Alert Box -->
                            <div style="padding: 20px 0; margin-bottom: 32px;">
                                <p style="margin: 0; color: #666; font-size: 14px; line-height: 1.4; text-align: center;">
                                  You have <strong style="color: #d32f2f;">20 hours</strong> to confirm your spot.
                                  <br>Deadline: <strong>${deadlineStr}</strong>
                                </p>
                            </div>

                            <div style="text-align: center; margin: 32px 0;">
                              <a href="${APP_BASE_URL}/trip/${trip.id}" style="display: inline-block; background: linear-gradient(135deg, #e03a3e 0%, #d32f2f 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(224, 58, 62, 0.3); transition: all 0.3s ease;">
                                Login to Confirm Spot
                              </a>
                            </div>

                            <div style="text-align: center; margin-top: 20px;">
                                <p style="color: #999; font-size: 13px;">If you do not confirm by the deadline, the spot will automatically go to the next person on the list.</p>
                            </div>
                          </td>
                        </tr>

                        <tr>
                          <td style="background-color: #2c2c2c; padding: 24px 40px; text-align: center;">
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
          } catch(e) { console.error("Failed to email promoted user", e); }

          await client.query(
            `INSERT INTO activity_logs (user_id, trip_id, action_type, description, metadata)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              person.user_id,
              trip.id,
              'PROMOTED_FROM_WAITLIST',
              `Promoted from waitlist to active roster for ${trip.name} - must check in by ${deadlineStr}`,
              JSON.stringify({ tripName: trip.name, deadline: deadline.toISOString() })
            ]
          );
        }
      }
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Automation Error:', e);
  } finally {
    client.release();
    automationRunning = false;
  }
}

router.post('/:id/promote', adminRequired, async (req, res) => {
  try {
    const regId = Number(req.params.id);

    const now = new Date();
    const deadline = new Date(Date.now() + 20 * 60 * 60 * 1000);

    await pool.query(
      `UPDATE registrations
       SET moved_to_waitlist = FALSE,
           promotion_expires_at = $1,
           check_in_deadline = $1,
           promoted_from_waitlist_at = $2,
           waitlist_position = NULL
       WHERE id = $3`,
      [deadline, now, regId]
    );

    const { rows: [user] } = await pool.query(
        'SELECT u.id as user_id, u.email, u.first_name, t.id as trip_id, t.name, t.trip_date FROM registrations r JOIN users u ON u.id = r.user_id JOIN trips t ON t.id = r.trip_id WHERE r.id = $1',
        [regId]
    );

    if (user) {
        const deadlineFormatted = deadline.toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short'
        });

        transporter.sendMail({
            from: FROM,
            to: user.email,
            subject: `You've been promoted for ${user.name}!`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f5f5f5;">
                        <tr>
                            <td align="center" style="padding: 40px 20px;">
                                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); overflow: hidden;">
                                    <tr>
                                        <td style="background: linear-gradient(135deg, #e03a3e 0%, #d32f2f 100%); padding: 30px 40px; text-align: center;">
                                            <div style="color: white; font-size: 28px; font-weight: 700; margin-bottom: 8px;">
                                                You've Been Promoted!
                                            </div>
                                            <div style="color: rgba(255,255,255,0.9); font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 2px;">
                                                UMD Ski Club
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 40px;">
                                            <h2 style="color: #2c2c2c; font-size: 20px; margin: 0 0 20px 0;">
                                                Hi ${user.first_name || 'there'}!
                                            </h2>
                                            <p style="color: #666666; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                                                A spot has opened up for <strong>${user.name}</strong> and you've been moved from the waitlist to a confirmed spot.
                                            </p>
                                            <div style="padding: 20px 0; margin: 20px 0;">
                                                <p style="margin: 0; color: #666; font-size: 14px; line-height: 1.4; text-align: center;">
                                                    You must check in within <strong style="color: #d32f2f;">20 hours</strong> or the spot will be given to someone else.
                                                </p>
                                            </div>
                                            <div style="text-align: center; margin: 32px 0;">
                                                <a href="${APP_BASE_URL}/trip/${user.trip_id}" style="display: inline-block; background: linear-gradient(135deg, #e03a3e 0%, #d32f2f 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                                                    Confirm Spot
                                                </a>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="background-color: #2c2c2c; padding: 24px 40px; text-align: center;">
                                            <p style="color: rgba(255,255,255,0.7); font-size: 12px; margin: 0;">
                                                © ${new Date().getFullYear()} 123 I Like To Ski @ University of Maryland
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </body>
                </html>
            `,
            text: `Hi ${user.first_name || 'there'}!\n\nYou've been promoted from the waitlist for ${user.name}.\n\nYou must check in within 20 hours or the spot will be given to someone else.\nDeadline: ${deadlineFormatted}\n\nVisit 123iliketoski.com for more details.`
        }).catch(console.error);

        await logActivity({
          userId: user.user_id,
          tripId: user.trip_id,
          actionType: 'MANUALLY_PROMOTED',
          description: `Manually promoted from waitlist by admin for ${user.name} - must check in by ${deadlineFormatted}`,
          performedBy: req.user.id,
          metadata: { tripName: user.name, deadline: deadline.toISOString() }
        });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to promote user' });
  }
});

router.post('/:id/demote', adminRequired, async (req, res) => {
  try {
    const regId = Number(req.params.id);

    const { rows: [reg] } = await pool.query(
      'SELECT trip_id FROM registrations WHERE id = $1',
      [regId]
    );

    if (!reg) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    const { rows: [maxPos] } = await pool.query(
      'SELECT MAX(waitlist_position) as max_pos FROM registrations WHERE trip_id = $1 AND moved_to_waitlist = TRUE',
      [reg.trip_id]
    );

    const nextPosition = (maxPos.max_pos || 0) + 1;

    await pool.query(
      `UPDATE registrations
       SET moved_to_waitlist = TRUE,
           waitlist_position = $1,
           promotion_expires_at = NULL
       WHERE id = $2`,
      [nextPosition, regId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to demote user' });
  }
});

router.post('/:tripId/waitlist/reorder', adminRequired, async (req, res) => {
  try {
    const tripId = Number(req.params.tripId);
    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: 'orderedIds must be an array' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (let i = 0; i < orderedIds.length; i++) {
        await client.query(
          'UPDATE registrations SET waitlist_position = $1 WHERE id = $2 AND trip_id = $3 AND moved_to_waitlist = TRUE',
          [i + 1, orderedIds[i], tripId]
        );
      }

      const { rows: [trip] } = await client.query('SELECT name FROM trips WHERE id = $1', [tripId]);

      if (trip) {
        await client.query(
          `INSERT INTO activity_logs (trip_id, action_type, description, performed_by, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            tripId,
            'WAITLIST_REORDERED',
            `Admin reordered waitlist for ${trip.name} (${orderedIds.length} positions updated)`,
            req.user.id,
            JSON.stringify({ tripName: trip.name, totalReordered: orderedIds.length })
          ]
        );
      }

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reorder waitlist' });
  }
});

module.exports = router;
module.exports.runAutomation = runAutomation;
