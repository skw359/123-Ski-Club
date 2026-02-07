const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { pool, APP_BASE_URL } = require('../config');
const { transporter, FROM } = require('../utils/email');
const { isUmdEmail, signSession, verifySession, areExternalEmailsAllowed } = require('../utils/helpers');
const { magicLinkLimiter } = require('../middleware/rateLimits');

router.post('/request-magic-link', magicLinkLimiter, async (req, res) => {
  try {
    const { email, first_name, last_name } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email required' });

    const allowExternal = await areExternalEmailsAllowed();

    if (!allowExternal && !isUmdEmail(email)) {
      return res.status(400).json({ error: 'Email must end with @terpmail.umd.edu or @umd.edu' });
    }

    const lower = email.toLowerCase();

    const isRegistration = first_name || last_name;

    const userResult = await pool.query(
      'SELECT id, email, first_name, last_name FROM users WHERE LOWER(email)=LOWER($1)',
      [lower]
    );
    let user = userResult.rows[0];

    if (!isRegistration) {
      if (!user) {
        return res.status(404).json({
          error: 'Account not found. Please register first.',
          action: 'register_required'
        });
      }
    } else {
      if (user) {
      } else {
        if (!first_name || first_name.trim().length < 2) {
          return res.status(400).json({ error: 'First name must be at least 2 characters' });
        }
        if (!last_name || last_name.trim().length < 1) {
          return res.status(400).json({ error: 'Last name is required' });
        }

        const ins = await pool.query(
          `INSERT INTO users (email, first_name, last_name)
           VALUES ($1, $2, $3)
           RETURNING id, email, first_name, last_name`,
          [lower, first_name.trim(), last_name.trim()]
        );
        user = ins.rows[0];
      }
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      `INSERT INTO magic_link_tokens (token, user_id, expires_at)
       VALUES ($1, $2, $3)`,
      [token, user.id, expiresAt]
    );

    const link = `${APP_BASE_URL}/api/auth/consume?token=${token}`;

    const isNewUser = isRegistration && !userResult.rows[0];
    const emailSubject = isNewUser ?
      'Welcome to 123 Ski & Snowboard Club! - Complete your registration' :
      'Your UMD Ski Club Login Link';

    const welcomeMessage = isNewUser ?
      'Welcome to 123 Ski & Snowboard Club @ University of Maryland! Click the button below to complete your registration and access your account.' :
      'Ready to hit the slopes? Click the button below to access your account.';

    await transporter.sendMail({
      from: FROM,
      to: lower,
      subject: emailSubject,
      text: `Click to sign in: ${link}\nThis link expires in 15 minutes.`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>UMD Ski Club ${isNewUser ? 'Registration' : 'Login'}</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f5f5f5;">
            <tr>
              <td align="center" style="padding: 40px 20px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); overflow: hidden;">

                  <!-- Header with branding cuz hell yeaaaa -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #e03a3e 0%, #d32f2f 100%); padding: 30px 40px; text-align: center;">
                      <div style="color: white; font-size: 28px; font-weight: 700; margin-bottom: 8px; letter-spacing: -0.5px;">
                        ${isNewUser ? 'Welcome to' : ''} UMD Ski Club
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
                            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; font-size: 18px; font-weight: bold;">🎿</div>
                          </div>
                        </div>
                        <h1 style="color: #2c2c2c; font-size: 24px; font-weight: 600; margin: 0 0 12px 0; line-height: 1.3;">
                          ${isNewUser ? 'Welcome' : 'Hi'}${user.first_name ? ' ' + user.first_name : ''}!
                        </h1>
                        <p style="color: #666666; font-size: 16px; margin: 0; line-height: 1.5;">
                          ${welcomeMessage}
                        </p>
                      </div>

                      <div style="text-align: center; margin: 32px 0;">
                        <a href="${link}" style="display: inline-block; background: linear-gradient(135deg, #e03a3e 0%, #d32f2f 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(224, 58, 62, 0.3); transition: all 0.3s ease;">
                          ${isNewUser ? 'Complete Registration' : 'Sign In to 123 Ski Club'}
                        </a>
                      </div>

                      <div style="text-align: center; margin: 24px 0; padding: 20px; background-color: #f9f9f9; border-radius: 8px;">
                        <p style="color: #666666; font-size: 14px; margin: 0 0 8px 0; font-weight: 500;">
                          Button not working? Copy and paste this link:
                        </p>
                        <p style="color: #e03a3e; font-size: 14px; margin: 0; word-break: break-all; font-family: monospace;">
                          ${link}
                        </p>
                      </div>

                      <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #eeeeee;">
                        <p style="color: #999999; font-size: 13px; margin: 0; line-height: 1.4;">
                          This ${isNewUser ? 'registration' : 'login'} link expires in <strong style="color: #e03a3e;">15 minutes</strong> for your security.
                          <br>
                          If you didn't request this ${isNewUser ? 'registration' : 'link'}, you can safely ignore this email.
                        </p>
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td style="background-color: #2c2c2c; padding: 24px 40px; text-align: center;">
                      <p style="color: rgba(255,255,255,0.7); font-size: 12px; margin: 0; line-height: 1.5;">
                        © ${new Date().getFullYear()} 123 I Like To Ski @ University of Maryland, College Park
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

    res.json({
      ok: true,
      message: isNewUser ? 'Registration successful! Check your email.' : 'Login link sent!'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Unable to send magic link' });
  }
});

router.get('/consume', async (req, res) => {
  try {
    const { token } = req.query;
    console.log('Consuming token:', token);

    if (!token) {
      console.log('No token provided');
      return res.status(400).send('Missing token');
    }

    const { rows } = await pool.query(
      `SELECT m.token, m.expires_at, m.used_at,
          u.id, u.email, u.first_name, u.last_name, u.is_admin
     FROM magic_link_tokens m
     JOIN users u ON u.id = m.user_id
    WHERE m.token = $1`,
      [token]
    );

    const row = rows[0];
    console.log('Found user:', row ? row.email : 'none');

    if (!row) {
      console.log('Invalid token');
      return res.status(400).send('Invalid token');
    }
    if (row.used_at) {
      console.log('Token already used');
      return res.status(400).send('Token already used');
    }
    if (new Date(row.expires_at) <= new Date()) {
      console.log('Token expired');
      return res.status(400).send('Token expired');
    }

    const allowExternal = await areExternalEmailsAllowed();

    if (!allowExternal && !isUmdEmail(row.email)) {
      console.log('Not UMD email and external not allowed');
      return res.status(400).send('Email must end with @terpmail.umd.edu or @umd.edu');
    }

    await pool.query('UPDATE magic_link_tokens SET used_at = NOW() WHERE token = $1', [token]);

    const session = signSession({
      id: row.id,
      email: row.email,
      first_name: row.first_name,
      last_name: row.last_name,
      role: row.is_admin ? 'admin' : 'member'
    });

    res.cookie('session', session, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      maxAge: 120 * 24 * 60 * 60 * 1000,
      path: '/'
    });

    console.log('Login successful, redirecting to homepage');
    res.redirect('/');
  } catch (err) {
    console.error('Consume error:', err);
    res.status(500).send('Error consuming token');
  }
});

router.get('/me', (req, res) => {
  const token = req.cookies.session;
  if (!token) return res.json({ user: null });
  const data = verifySession(token);
  if (!data) return res.json({ user: null });
  res.json({ user: data });
});

router.post('/logout', (req, res) => {
  res.clearCookie('session');
  res.json({ ok: true });
});

router.get('/config', async (req, res) => {
  const allowExternal = await areExternalEmailsAllowed();
  res.json({ allowExternalEmails: allowExternal });
});

module.exports = router;
