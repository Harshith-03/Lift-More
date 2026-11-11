import { describe, expect, it } from 'vitest';
import { addDays, localDate, weekStartOf } from './index';

describe('localDate', () => {
  it('Sunday 23:30 in Los Angeles is still Sunday there but Monday in UTC', () => {
    // 2026-11-08 is a Sunday; PST (UTC-8) after DST ended on 2026-11-01.
    const at = '2026-11-09T07:30:00.000Z';
    expect(localDate(at, 'America/Los_Angeles')).toBe('2026-11-08');
    expect(localDate(at, 'UTC')).toBe('2026-11-09');
  });
  it('handles positive and half-hour offsets', () => {
    expect(localDate('2026-11-08T15:30:00.000Z', 'Asia/Tokyo')).toBe('2026-11-09');
    expect(localDate('2026-11-08T18:29:00.000Z', 'Asia/Kolkata')).toBe('2026-11-08');
    expect(localDate('2026-11-08T18:30:00.000Z', 'Asia/Kolkata')).toBe('2026-11-09');
    expect(localDate('2026-11-08T10:00:00.000Z', 'Pacific/Kiritimati')).toBe('2026-11-09');
  });
  it('accepts Date objects', () => {
    expect(localDate(new Date('2026-01-01T04:59:59.000Z'), 'America/New_York')).toBe('2025-12-31');
    expect(localDate(new Date('2026-01-01T05:00:00.000Z'), 'America/New_York')).toBe('2026-01-01');
  });
  it('falls back to UTC for an unknown timezone', () => {
    expect(localDate('2026-11-09T07:30:00.000Z', 'Not/AZone')).toBe('2026-11-09');
  });
  it('throws on an invalid instant', () => {
    expect(() => localDate('nope', 'UTC')).toThrow();
  });
});

describe('weekStartOf (Monday)', () => {
  it('Sunday 23:30 LA belongs to the week before the UTC week', () => {
    const at = '2026-11-09T07:30:00.000Z';
    expect(weekStartOf(at, 'America/Los_Angeles')).toBe('2026-11-02');
    expect(weekStartOf(at, 'UTC')).toBe('2026-11-09');
  });
  it('Monday 00:30 local starts a new week', () => {
    // 2026-11-09 00:30 PST = 08:30Z
    expect(weekStartOf('2026-11-09T08:30:00.000Z', 'America/Los_Angeles')).toBe('2026-11-09');
  });
  it('is correct in DST-start week (US 2026-03-08)', () => {
    // Sunday 2026-03-08 23:30 PDT (UTC-7) = 2026-03-09T06:30Z
    expect(weekStartOf('2026-03-09T06:30:00.000Z', 'America/Los_Angeles')).toBe('2026-03-02');
    // Monday 2026-03-09 00:30 PDT = 07:30Z
    expect(weekStartOf('2026-03-09T07:30:00.000Z', 'America/Los_Angeles')).toBe('2026-03-09');
    // During the skipped hour itself
    expect(localDate('2026-03-08T10:30:00.000Z', 'America/Los_Angeles')).toBe('2026-03-08');
  });
  it('is correct in DST-end week (US 2026-11-01)', () => {
    // Sunday 2026-11-01 23:30 PST (UTC-8) = 2026-11-02T07:30Z
    expect(weekStartOf('2026-11-02T07:30:00.000Z', 'America/Los_Angeles')).toBe('2026-10-26');
    // The repeated 01:30 hour happens twice on Sunday 2026-11-01
    expect(localDate('2026-11-01T08:30:00.000Z', 'America/Los_Angeles')).toBe('2026-11-01');
    expect(localDate('2026-11-01T09:30:00.000Z', 'America/Los_Angeles')).toBe('2026-11-01');
  });
  it('handles European DST and southern-hemisphere DST', () => {
    // EU DST ends 2026-10-25 (Sunday). Sunday 23:30 CET = 22:30Z
    expect(weekStartOf('2026-10-25T22:30:00.000Z', 'Europe/Berlin')).toBe('2026-10-19');
    expect(weekStartOf('2026-10-25T23:30:00.000Z', 'Europe/Berlin')).toBe('2026-10-26');
    // Sydney DST starts 2026-10-04 (Sunday). Monday 00:30 AEDT (UTC+11) = Sunday 13:30Z
    expect(weekStartOf('2026-10-04T13:30:00.000Z', 'Australia/Sydney')).toBe('2026-10-05');
    expect(weekStartOf('2026-10-04T13:30:00.000Z', 'UTC')).toBe('2026-09-28');
  });
  it('every day of a week maps to the same Monday', () => {
    for (let d = 0; d < 7; d++) {
      const day = addDays('2026-11-09', d);
      expect(weekStartOf(`${day}T12:00:00.000Z`, 'UTC')).toBe('2026-11-09');
    }
  });
  it('crosses year boundaries', () => {
    // 2027-01-01 is a Friday → week starts Monday 2026-12-28
    expect(weekStartOf('2027-01-01T12:00:00.000Z', 'UTC')).toBe('2026-12-28');
  });
});

describe('addDays', () => {
  it('adds and subtracts calendar days', () => {
    expect(addDays('2026-11-09', 7)).toBe('2026-11-16');
    expect(addDays('2026-11-09', -7)).toBe('2026-11-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-11-09', 0)).toBe('2026-11-09');
  });
  it('is unaffected by DST transitions', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-10-31', 2)).toBe('2026-11-02');
    expect(addDays('2026-01-05', 7 * 52)).toBe('2027-01-04');
  });
  it('rejects malformed input', () => {
    expect(() => addDays('11/09/2026', 1)).toThrow();
  });
});
