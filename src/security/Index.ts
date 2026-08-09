// Security — auth, rate limiting, input validation, retention (v1 §17).

export { AdminAuth, ROLE_HIERARCHY } from './Auth.js';
export type { AdminPrincipal, AdminRole } from './Auth.js';
export { RateLimiter } from './RateLimiter.js';
export type { RateLimitBucket, RateLimitDecision, RateLimiterOptions } from './RateLimiter.js';
export {
  ALLOWED_MEDIA_TYPES,
  MAX_MEDIA_BYTES,
  MAX_MESSAGE_LENGTH,
  isValidPhoneNumber,
  sanitizeMessageText,
  validateMedia,
} from './Validate.js';
export type { MediaValidationResult, SanitizedMessage } from './Validate.js';
export { ForgetMeService } from './Retention.js';
export type { ForgetMeReport, RetentionPolicy } from './Retention.js';

