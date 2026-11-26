/**
 * In-memory sliding-window rate limiter for sensitive invite and authentication endpoints.
 * Provides granular tracking per IP / action without requiring external cache infrastructure.
 */
const rateLimitMap = new Map();

// Periodic cleanup of expired rate limit windows every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Creates an Express rate-limiting middleware.
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds (e.g. 60000 = 1 min)
 * @param {number} options.max - Max requests allowed per window
 * @param {string} options.message - Error message when limit is exceeded
 * @param {function} [options.keyGenerator] - Custom key generator function (default: IP)
 */
function createRateLimiter({ windowMs = 60000, max = 10, message = 'Too many requests, please try again later.', keyGenerator = null }) {
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
    const key = keyGenerator ? keyGenerator(req) : `${ip}:${req.baseUrl || ''}${req.path || ''}`;
    const now = Date.now();

    let record = rateLimitMap.get(key);
    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs
      };
      rateLimitMap.set(key, record);
      return next();
    }

    record.count++;
    if (record.count > max) {
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      return res.status(429).json({
        message,
        retryAfterSeconds
      });
    }

    next();
  };
}

module.exports = {
  createRateLimiter
};
