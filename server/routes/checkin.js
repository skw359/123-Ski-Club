const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { pool, APP_BASE_URL } = require('../config');
const { transporter, FROM } = require('../utils/email');
const { logActivity } = require('../utils/logger');
const { adminRequired } = require('../middleware/auth');

// Send check-in emails to all active roster members (48 hours before departure)
router.post('/send-checkin-emails', adminRequired, async (req, res) => {
  try {
    const { tripId } = req.body;

    if (!tripId) {
      return res.status(400).json({ error: 'tripId is required' });
    }

    const { rows: [trip] } = await pool.query(
      'SELECT * FROM trips WHERE id = $1',
      [tripId]
    );

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    if (!trip.requires_checkin) {
      return res.status(400).json({ error: 'This trip does not require check-in' });
    }

    if (trip.checkin_emails_sent) {
      return res.status(400).json({ error: 'Check-in emails have already been sent for this trip' });
    }

    // Exclude users promoted from waitlist (they are auto-checked-in)
    const { rows: activeMembers } = await pool.query(
      `SELECT r.id as registration_id, r.user_id, u.email, u.first_name, u.last_name
       FROM registrations r
       JOIN users u ON u.id = r.user_id
       WHERE r.trip_id = $1
         AND r.moved_to_waitlist = FALSE
         AND (r.checked_in = FALSE OR r.checked_in IS NULL)
         AND r.promoted_from_waitlist_at IS NULL`,
      [tripId]
    );

    if (activeMembers.length === 0) {
      return res.json({
        success: true,
        message: 'No members need check-in emails',
        emailsSent: 0
      });
    }

    let emailsSent = 0;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const member of activeMembers) {
        const token = crypto.randomBytes(32).toString('hex');

        await client.query(
          'UPDATE registrations SET trip_checkin_token = $1 WHERE id = $2',
          [token, member.registration_id]
        );

        const checkInLink = `${APP_BASE_URL}/?checkin=${token}`;

        const tripDate = new Date(trip.trip_date);
        const checkInStart = new Date(tripDate);
        checkInStart.setDate(checkInStart.getDate() - 2);
        checkInStart.setHours(0, 0, 0, 0);

        const checkInEnd = new Date(checkInStart);
        checkInEnd.setHours(23, 59, 59, 999);

        const formattedStartDate = checkInStart.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric'
        });

        await transporter.sendMail({
          from: FROM,
          to: member.email,
          subject: `Action Required: Check In for ${trip.name}`,
          text: `Hi ${member.first_name},\n\nPlease confirm your attendance for ${trip.name} on ${tripDate.toLocaleDateString()}.\n\nCheck-in Window: ${formattedStartDate}, 12:00 AM - 11:59 PM\n\nClick here to check-in:\n${checkInLink}\n\n- If YES: Your spot is confirmed\n- If NO: Your spot will be released\n\nPlease respond during the check-in window.\n\nUMD Ski Club`,
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
                        <td style="background-color: #e21833; padding: 40px 30px; text-align: center;">
                          <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Trip Check-In Required</h1>
                        </td>
                      </tr>

                      <tr>
                        <td style="padding: 40px 30px;">
                          <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333;">
                            Hi ${member.first_name},
                          </p>
                          <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333;">
                            You're registered for <strong>${trip.name}</strong> on <strong>${tripDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</strong>.
                          </p>
                          <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333;">
                            Please check in within the next 24 hours to let us know you're still able to attend. If you don't check in, your spot will be released to the next person on the waitlist.
                          </p>

                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                            <tr>
                              <td align="center" style="padding: 20px 0;">
                                <a href="${checkInLink}" style="display: inline-block; padding: 16px 40px; background-color: #e21833; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(226, 24, 51, 0.3);">
                                  Check-In Now
                                </a>
                              </td>
                            </tr>
                          </table>

                          <ul style="margin: 10px 0 20px 20px; padding: 0; font-size: 14px; line-height: 1.8; color: #666666;">
                            <li>If <strong>YES</strong>: Your spot is confirmed</li>
                            <li>If <strong>NO</strong>: Your spot will be released for others</li>
                          </ul>

                          <p style="margin: 20px 0 0 0; font-size: 14px; line-height: 1.6; color: #999999; text-align: center;">
                            See you on the slopes!<br>
                            <strong>UMD Ski Club</strong>
                          </p>
                        </td>
                      </tr>

                      <tr>
                        <td style="background-color: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #e0e0e0;">
                          <p style="margin: 0; font-size: 12px; color: #999999;">
  © 2026 123 I Like To Ski @ University of Maryland, College Park. 
  Questions? Contact us at 
  <a href="mailto:umdskiclub@gmail.com" style="color: #ff0000; text-decoration: underline;">
    umdskiclub@gmail.com
  </a>
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
      }

      await client.query(
        'UPDATE trips SET checkin_emails_sent = TRUE WHERE id = $1',
        [tripId]
      );

      await client.query('COMMIT');

      await logActivity({
        tripId: tripId,
        actionType: 'CHECKIN_EMAILS_SENT',
        description: `Check-in emails sent to ${emailsSent} active roster members for ${trip.name}`,
        performedBy: req.user.id,
        metadata: { emailsSent, tripName: trip.name }
      });

      res.json({
        success: true,
        message: `Check-in emails sent to ${emailsSent} members`,
        emailsSent
      });

    } catch (emailError) {
      await client.query('ROLLBACK');
      throw emailError;
    } finally {
      client.release();
    }

  } catch (err) {
    console.error('Error sending check-in emails:', err);
    res.status(500).json({ error: 'Failed to send check-in emails' });
  }
});

router.get('/trip-checkin/info/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const { rows } = await pool.query(
      `SELECT r.id as registration_id, r.checked_in, r.check_in_response_at,
              t.id as trip_id, t.name as trip_name, t.destination, t.trip_date, t.departure_time,
              u.first_name, u.last_name
       FROM registrations r
       JOIN trips t ON t.id = r.trip_id
       JOIN users u ON u.id = r.user_id
       WHERE r.trip_checkin_token = $1`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired check-in link' });
    }

    const data = rows[0];

    const tripDate = new Date(data.trip_date);
    const checkInStart = new Date(tripDate);
    checkInStart.setDate(checkInStart.getDate() - 2);
    checkInStart.setHours(0, 0, 0, 0);

    const checkInEnd = new Date(checkInStart);
    checkInEnd.setHours(23, 59, 59, 999);

    const now = new Date();
    let windowStatus = 'closed';
    if (now < checkInStart) {
      windowStatus = 'not_yet_open';
    } else if (now >= checkInStart && now <= checkInEnd) {
      windowStatus = 'open';
    }

    res.json({
      registration_id: data.registration_id,
      trip_id: data.trip_id,
      trip_name: data.trip_name,
      destination: data.destination,
      trip_date: data.trip_date,
      departure_time: data.departure_time,
      first_name: data.first_name,
      last_name: data.last_name,
      checked_in: data.checked_in,
      check_in_response_at: data.check_in_response_at,
      check_in_window: {
        start: checkInStart,
        end: checkInEnd,
        status: windowStatus
      }
    });

  } catch (err) {
    console.error('Error getting check-in info:', err);
    res.status(500).json({ error: 'Failed to get check-in info' });
  }
});

router.post('/trip-checkin/confirm/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const { rows } = await pool.query(
      `SELECT r.id as registration_id, r.user_id, r.checked_in,
              t.id as trip_id, t.name as trip_name, t.trip_date
       FROM registrations r
       JOIN trips t ON t.id = r.trip_id
       WHERE r.trip_checkin_token = $1`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired check-in link' });
    }

    const { registration_id, user_id, checked_in, trip_id, trip_name, trip_date } = rows[0];

    if (checked_in) {
      return res.json({
        success: true,
        message: 'You have already checked in for this trip',
        already_checked_in: true
      });
    }

    const tripDate = new Date(trip_date);
    const checkInStart = new Date(tripDate);
    checkInStart.setDate(checkInStart.getDate() - 2);
    checkInStart.setHours(0, 0, 0, 0);

    const checkInEnd = new Date(checkInStart);
    checkInEnd.setHours(23, 59, 59, 999);

    const now = new Date();

    if (now < checkInStart) {
      return res.status(400).json({
        error: 'Check-in window has not opened yet',
        window_opens_at: checkInStart
      });
    }

    if (now > checkInEnd) {
      return res.status(400).json({
        error: 'Check-in window has closed',
        window_closed_at: checkInEnd
      });
    }

    await pool.query(
      `UPDATE registrations
       SET checked_in = TRUE, check_in_response_at = NOW()
       WHERE id = $1`,
      [registration_id]
    );

    await logActivity({
      userId: user_id,
      tripId: trip_id,
      actionType: 'TRIP_CHECKIN_CONFIRMED',
      description: `Confirmed attendance for ${trip_name} via 2-day check-in`,
      metadata: { registrationId: registration_id }
    });

    res.json({
      success: true,
      message: 'Check-in confirmed! Your spot is secured for this trip.'
    });

  } catch (err) {
    console.error('Error confirming check-in:', err);
    res.status(500).json({ error: 'Failed to confirm check-in' });
  }
});

router.post('/trip-checkin/decline/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const { rows } = await pool.query(
      `SELECT r.id as registration_id, r.user_id, r.checked_in, r.moved_to_waitlist,
              t.id as trip_id, t.name as trip_name, t.trip_date
       FROM registrations r
       JOIN trips t ON t.id = r.trip_id
       WHERE r.trip_checkin_token = $1`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired check-in link' });
    }

    const { registration_id, user_id, checked_in, moved_to_waitlist, trip_id, trip_name, trip_date } = rows[0];

    if (moved_to_waitlist) {
      return res.json({
        success: true,
        message: 'You have already been removed from this trip',
        already_removed: true
      });
    }

    const tripDate = new Date(trip_date);
    const checkInStart = new Date(tripDate);
    checkInStart.setDate(checkInStart.getDate() - 2);
    checkInStart.setHours(0, 0, 0, 0);

    const checkInEnd = new Date(checkInStart);
    checkInEnd.setHours(23, 59, 59, 999);

    const now = new Date();

    if (now < checkInStart) {
      return res.status(400).json({
        error: 'Check-in window has not opened yet',
        window_opens_at: checkInStart
      });
    }

    if (now > checkInEnd) {
      return res.status(400).json({
        error: 'Check-in window has closed',
        window_closed_at: checkInEnd
      });
    }

    const { rows: [maxPos] } = await pool.query(
      'SELECT MAX(waitlist_position) as max_pos FROM registrations WHERE trip_id = $1 AND moved_to_waitlist = TRUE',
      [trip_id]
    );

    const nextPosition = (maxPos.max_pos || 0) + 1;

    await pool.query(
      `UPDATE registrations
       SET moved_to_waitlist = TRUE,
           waitlist_position = $1,
           checked_in = FALSE,
           check_in_response_at = NOW()
       WHERE id = $2`,
      [nextPosition, registration_id]
    );

    await logActivity({
      userId: user_id,
      tripId: trip_id,
      actionType: 'TRIP_CHECKIN_DECLINED',
      description: `Declined attendance for ${trip_name} via 2-day check-in - moved to waitlist`,
      metadata: { registrationId: registration_id, waitlistPosition: nextPosition }
    });

    res.json({
      success: true,
      message: 'Your spot has been released. You have been moved to the waitlist.'
    });

  } catch (err) {
    console.error('Error declining check-in:', err);
    res.status(500).json({ error: 'Failed to decline check-in' });
  }
});

module.exports = router;
