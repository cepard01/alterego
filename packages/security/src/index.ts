// Security — auth, rate limiting, input validation, retention (v1 §17).

export { AdminAuth, ROLE_HIERARCHY } from './auth.js';
export type { AdminPrincipal, AdminRole } from './auth.js';
export { RateLimiter } from './rate-limiter.js';
export type { RateLimitBucket, RateLimitDecision, RateLimiterOptions } from './rate-limiter.js';
export {
  ALLOWED_MEDIA_TYPES,
  MAX_MEDIA_BYTES,
  MAX_MESSAGE_LENGTH,
  isValidPhoneNumber,
  sanitizeMessageText,
  validateMedia,
} from './validate.js';
export type { MediaValidationResult, SanitizedMessage } from './validate.js';
export { ForgetMeService } from './retention.js';
export type { ForgetMeReport, RetentionPolicy } from './retention.js';
