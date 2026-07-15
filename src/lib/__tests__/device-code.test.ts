import { describe, it, expect } from 'vitest';
import {
  createDeviceCode,
  lookupByUserCode,
  approveDeviceCode,
  pollDeviceCode,
  normalizeUserCode,
  DEVICE_CODE_TTL_SEC,
} from '../device-code';

describe('device-code (P2.5)', () => {
  it('normalisiert User-Eingaben auf XXXX-XXXX', () => {
    expect(normalizeUserCode('abcd2345')).toBe('ABCD-2345');
    expect(normalizeUserCode('abcd-2345')).toBe('ABCD-2345');
    expect(normalizeUserCode(' ab cd 23 45 ')).toBe('ABCD-2345');
  });

  it('voller Flow: create → approve → poll liefert Token GENAU EINMAL', () => {
    const t0 = 1_000_000;
    const { userCode, deviceCode } = createDeviceCode(['vote'], 'test agent', t0);
    expect(userCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    expect(pollDeviceCode(deviceCode, t0 + 1000).status).toBe('pending');
    expect(lookupByUserCode(userCode, t0 + 1000)?.tokenName).toBe('test agent');

    expect(approveDeviceCode(userCode, 'user1', 'kbk_pat_secret', t0 + 2000)).toBe(true);

    expect(pollDeviceCode(deviceCode, t0 + 3000)).toEqual({ status: 'approved', token: 'kbk_pat_secret' });
    // Zweiter Poll: Eintrag ist weg → expired (kein zweites Ausliefern).
    expect(pollDeviceCode(deviceCode, t0 + 3001).status).toBe('expired');
  });

  it('abgelaufener Code (nach TTL) → lookup null + poll expired', () => {
    const t0 = 5_000_000;
    const { userCode, deviceCode } = createDeviceCode(['vote'], 'x', t0);
    const past = t0 + DEVICE_CODE_TTL_SEC * 1000 + 1;
    expect(lookupByUserCode(userCode, past)).toBeNull();
    expect(pollDeviceCode(deviceCode, past).status).toBe('expired');
  });

  it('doppeltes approve → false', () => {
    const t0 = 6_000_000;
    const { userCode } = createDeviceCode(['vote'], 'x', t0);
    expect(approveDeviceCode(userCode, 'u', 'tok', t0 + 100)).toBe(true);
    expect(approveDeviceCode(userCode, 'u', 'tok2', t0 + 200)).toBe(false);
  });
});
