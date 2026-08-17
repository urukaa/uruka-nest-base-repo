import { getDateRange } from '../src/utils/date-range';

describe('getDateRange', () => {
  it('keeps a date-only string on the requested calendar day', () => {
    const { start, end } = getDateRange('2026-08-16', '2026-08-16');

    // The old implementation parsed this as UTC midnight and then applied
    // local setHours(), landing on the previous day west of UTC.
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(7); // August
    expect(start.getDate()).toBe(16);
    expect(end.getDate()).toBe(16);
  });

  it('spans the full day', () => {
    const { start, end } = getDateRange('2026-08-16', '2026-08-16');

    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(end.getHours()).toBe(23);
    expect(end.getMilliseconds()).toBe(999);
  });

  it('defaults to today when no arguments are given', () => {
    const { start, end } = getDateRange();
    const today = new Date().getDate();

    expect(start.getDate()).toBe(today);
    expect(end.getDate()).toBe(today);
    expect(start.getTime()).toBeLessThan(end.getTime());
  });

  it('rejects an inverted range', () => {
    expect(() => getDateRange('2026-08-17', '2026-08-16')).toThrow(
      /on or before/,
    );
  });

  it('rejects an unparseable date', () => {
    expect(() => getDateRange('not-a-date')).toThrow(/Invalid date/);
  });
});
