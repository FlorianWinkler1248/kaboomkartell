import { describe, it, expect, beforeAll } from 'vitest';
import { signUnsubscribe, verifyUnsubscribe, unsubscribeUrl } from '../newsletter';

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = 'test-secret-for-unsubscribe-hmac';
});

describe('newsletter unsubscribe HMAC (P1.1)', () => {
  it('verifiziert eine korrekt signierte userId', () => {
    const uid = 'user_abc123';
    expect(verifyUnsubscribe(uid, signUnsubscribe(uid))).toBe(true);
  });

  it('lehnt eine manipulierte Signatur ab', () => {
    const uid = 'user_abc123';
    const sig = signUnsubscribe(uid);
    const tampered = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0');
    expect(verifyUnsubscribe(uid, tampered)).toBe(false);
  });

  it('lehnt die Signatur einer anderen userId ab', () => {
    expect(verifyUnsubscribe('user_a', signUnsubscribe('user_b'))).toBe(false);
  });

  it('lehnt leere/ungültige Werte ab', () => {
    expect(verifyUnsubscribe('', '')).toBe(false);
    expect(verifyUnsubscribe('user_a', 'nothex!!')).toBe(false);
    expect(verifyUnsubscribe('user_a', 'abcd')).toBe(false);
  });

  it('baut eine absolute URL, deren sig round-trip verifiziert', () => {
    const url = unsubscribeUrl('https://kaboomkartell.com', 'user_x');
    expect(url).toContain('https://kaboomkartell.com/api/newsletter/unsubscribe');
    const u = new URL(url);
    expect(verifyUnsubscribe(u.searchParams.get('uid')!, u.searchParams.get('sig')!)).toBe(true);
  });
});
