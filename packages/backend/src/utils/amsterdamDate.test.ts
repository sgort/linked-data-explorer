import { isCalendarDate, secondsUntilAmsterdamMidnight, todayInAmsterdam } from './amsterdamDate';

describe('todayInAmsterdam', () => {
  test.each([
    // Summer time, UTC+2: the Amsterdam date turns at 22:00 UTC.
    ['2026-08-14T21:59:59Z', '2026-08-14'],
    ['2026-08-14T22:00:00Z', '2026-08-15'],
    // Winter time, UTC+1: the Amsterdam date turns at 23:00 UTC.
    ['2026-12-31T22:59:59Z', '2026-12-31'],
    ['2026-12-31T23:00:00Z', '2027-01-01'],
  ])('at %s it is %s in Amsterdam', (instant, expected) => {
    expect(todayInAmsterdam(new Date(instant))).toBe(expected);
  });

  test('defaults to the current time', () => {
    expect(todayInAmsterdam()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('secondsUntilAmsterdamMidnight', () => {
  test.each([
    ['2026-08-15T21:00:00Z', 3600], // 23:00 summer time
    ['2026-08-15T21:59:30Z', 30], // 23:59:30 summer time
    ['2026-12-31T22:00:00Z', 3600], // 23:00 winter time
    ['2026-08-14T22:00:00Z', 86400], // exactly midnight
  ])('at %s it is %i seconds', (instant, expected) => {
    expect(secondsUntilAmsterdamMidnight(new Date(instant))).toBe(expected);
  });
});

describe('isCalendarDate', () => {
  test.each(['2026-02-28', '2028-02-29', '2026-12-31'])('accepts %s', (value) => {
    expect(isCalendarDate(value)).toBe(true);
  });

  test.each([
    '2026-02-29',
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
    '2026-8-15',
    '2026-08-15T00:00',
    '',
  ])('rejects %s', (value) => {
    expect(isCalendarDate(value)).toBe(false);
  });

  test.each([[undefined], [20260815], [['2026-08-15']]])('rejects the non-string %p', (value) => {
    expect(isCalendarDate(value)).toBe(false);
  });
});
