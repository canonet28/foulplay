const EXPLICIT_TIME_ZONE_PATTERN = /(?:z|[+-]\d{2}:?\d{2})$/i;
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/;

export function normalizeMatchDateTime(value: string | undefined) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (EXPLICIT_TIME_ZONE_PATTERN.test(trimmed)) {
    return trimmed;
  }

  if (DATE_TIME_PATTERN.test(trimmed)) {
    return `${trimmed.replace(' ', 'T')}Z`;
  }

  return trimmed;
}

export function parseMatchDateTime(value: string | undefined) {
  const normalized = normalizeMatchDateTime(value);
  return normalized ? Date.parse(normalized) : Number.NaN;
}

export function toMatchDate(value: string | undefined) {
  const normalized = normalizeMatchDateTime(value);
  return normalized ? new Date(normalized) : null;
}

export function toMatchDateTimeIso(value: string | undefined) {
  const date = toMatchDate(value);
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : value;
}
