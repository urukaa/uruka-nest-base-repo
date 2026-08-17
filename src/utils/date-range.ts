/**
 * Builds an inclusive day range in the server's local timezone.
 *
 * `new Date('2026-08-16')` parses as UTC midnight, so calling setHours() on it
 * shifts the result by the UTC offset and can land on the wrong day. Date-only
 * input is therefore split into components and built locally instead.
 */
function startOfDay(value?: string): Date {
  const date = parseLocal(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value?: string): Date {
  const date = parseLocal(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function parseLocal(value?: string): Date {
  if (!value) return new Date();

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());

  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: "${value}"`);
  }

  return parsed;
}

export function getDateRange(
  startDate?: string,
  endDate?: string,
): { start: Date; end: Date } {
  const start = startOfDay(startDate);
  const end = endOfDay(endDate);

  if (start > end) {
    throw new Error('startDate must be on or before endDate');
  }

  return { start, end };
}
