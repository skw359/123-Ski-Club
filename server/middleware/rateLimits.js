// ──────────────────────────────────────────────────────────────────────────────
// Rate Limiting Configuration
// Rate limiters for various endpoints
// ──────────────────────────────────────────────────────────────────────────────

const rateLimit = require('express-rate-limit');

// Rate limit magic link requests (per-IP)
// Cloudflare proxy configuration - use CF-Connecting-IP header for real client IP
const magicLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  // Custom key generator to use Cloudflare's CF-Connecting-IP header
  keyGenerator: (req) => {
    // Cloudflare sends the real client IP in CF-Connecting-IP header
    return req.headers['cf-connecting-ip'] ||
           req.headers['x-forwarded-for']?.split(',')[0].trim() ||
           req.ip;
  },
  // Disable the trust proxy validation since we're handling IP extraction manually
  validate: { trustProxy: false }
});

module.exports = {
  magicLinkLimiter,
};
