// Input validation & sanitization for inbound messages and media (v1 §17).
// Every inbound payload is sanitized before entering the pipeline.

export const MAX_MESSAGE_LENGTH = 4096;
export const MAX_MEDIA_BYTES = 20_000_000; // WhatsApp outbound cap is 16 MB; be lenient inbound.
export const ALLOWED_MEDIA_TYPES = ['image', 'audio', 'video', 'document', 'sticker'] as const;

export type SanitizedMessage = {
  content: string;
  valid: boolean;
  reasons: string[];
};

/** Strip control characters (except \n\t), trim, cap length. */
export function sanitizeMessageText(raw: string | null | undefined, maxLength = MAX_MESSAGE_LENGTH): SanitizedMessage {
  const reasons: string[] = [];
  if (!raw) return { content: '', valid: false, reasons: ['empty'] };
  let content = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (content.length > maxLength) {
    content = content.slice(0, maxLength);
    reasons.push('truncated');
  }
  if (content.length === 0) {
    reasons.push('empty');
    return { content: '', valid: false, reasons };
  }
  return { content, valid: true, reasons };
}

export interface MediaValidationResult {
  valid: boolean;
  reasons: string[];
  sizeBytes?: number;
  mimeType?: string;
}

export function validateMedia(input: {
  type: string;
  sizeBytes: number;
  mimeType?: string | null;
}): MediaValidationResult {
  const reasons: string[] = [];
  if (!ALLOWED_MEDIA_TYPES.includes(input.type as (typeof ALLOWED_MEDIA_TYPES)[number])) {
    reasons.push(`unsupported type: ${input.type}`);
  }
  if (input.sizeBytes <= 0) reasons.push('empty file');
  if (input.sizeBytes > MAX_MEDIA_BYTES) reasons.push('too large');
  if (input.mimeType && !/^[\w.+-]+\/[\w.+-]+$/.test(input.mimeType)) reasons.push('malformed mime type');
  return {
    valid: reasons.length === 0,
    reasons,
    sizeBytes: input.sizeBytes,
    mimeType: input.mimeType ?? undefined,
  };
}

/** Reject phone numbers that are not plausible E.164-ish identifiers. */
export function isValidPhoneNumber(value: string): boolean {
  return /^\+?[1-9][0-9]{7,14}$/.test(value);
}
