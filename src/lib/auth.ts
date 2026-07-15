/**
 * NextAuth.js Konfiguration (Auth.js v5) - Full Version
 *
 * Erweitert auth.config.ts um den Credentials-Provider mit DB-Zugriff.
 * Wird NUR in Node.js Runtime genutzt (API-Routes, Server-Components).
 * NICHT in der Middleware (Edge Runtime) -> dort wird auth.config.ts direkt genutzt.
 */

import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcrypt';
import * as OTPAuth from 'otpauth';
import prisma from '@/lib/db';
import { authConfig } from '@/lib/auth.config';
import { getClientIp } from '@/lib/rate-limit';
import {
  loginRateLimit,
  isAccountLocked,
  computeLockoutUntil,
  MAX_FAILED_LOGIN_ATTEMPTS,
  decryptSecret,
  verifyBackupCode,
  isEmailOtpValid,
} from '@/lib/auth-security';
import { logSecurityEvent } from '@/lib/security-log';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // v2.9: jwt-Callback in Node-Runtime überschreiben (auth.config.ts ist
    // Edge-safe und macht KEINEN DB-Call). Hier checken wir bei jedem
    // Token-Refresh ob der User noch in der DB existiert + tokenVersion-Match.
    // Wenn nicht: leeren Token returnen, NextAuth hält den User für
    // ausgeloggt — kein "Sackgasse"-Mode mehr (gelöschter User mit valid JWT).
    async jwt({ token, user, trigger }) {
      // Initial-Login: wie gewohnt User-Daten ins Token schreiben.
      if (user) {
        token.role = (user as { role: string }).role;
        token.userId = user.id;
        token.username = (user as { username: string }).username;
        token.tokenVersion = (user as { tokenVersion?: number }).tokenVersion ?? 0;
        token.trustTier = (user as { trustTier?: string }).trustTier ?? 'T1';
        return token;
      }

      // Auf jedem Refresh (kein user-Object) gegen DB validieren.
      // Bei trigger='update' (z.B. nach 2FA-Setup) auch frische User-Daten
      // mitnehmen. Token kann null/leer werden, wenn User-Record gelöscht.
      if (token.userId) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.userId as string },
            select: {
              id: true,
              username: true,
              role: true,
              tokenVersion: true,
              trustTier: true,
              isActive: true,
            },
          });
          if (!dbUser || !dbUser.isActive) {
            // User gelöscht ODER deaktiviert → Token invalidieren.
            // Empty-Token = NextAuth treats as logged out.
            return {};
          }
          if ((dbUser.tokenVersion ?? 0) > ((token.tokenVersion as number) ?? 0)) {
            // tokenVersion-Mismatch (Logout-all-Devices wurde getriggert).
            return {};
          }
          // Frische Daten ins Token (Role/Trust-Tier können sich ändern).
          token.role = dbUser.role;
          token.username = dbUser.username;
          token.tokenVersion = dbUser.tokenVersion;
          token.trustTier = dbUser.trustTier;
        } catch (err) {
          console.error('[jwt] DB validation failed:', err);
          // Bei DB-Fehler nicht ausloggen — Cached Token weiter nutzen.
        }
      }

      // trigger='update' wird vom signaling triggers ausgelöst (z.B. nach
      // session.update() Aufruf in Client). Hier kein zusaetzlicher Lookup.
      void trigger;
      return token;
    },
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        // v2.6: loginIdentifier ist Email ODER Public Name (username).
        // Field heißt weiter "email" wegen NextAuth-Backwards-Compat,
        // semantisch ist es jetzt der Login-Identifier.
        email: { label: 'Email or Public Name', type: 'text' },
        password: { label: 'Passwort', type: 'password' },
        // 2FA-Code (TOTP, 6-stellig) ODER Backup-Code (XXXXX-XXXXX, 11 chars).
        // Optional — nur für User mit twoFactorEnabled gebraucht.
        totpCode: { label: '2FA Code', type: 'text' },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const identifier = (credentials.email as string).trim();
        const password = credentials.password as string;
        const totpCode = (credentials.totpCode as string | undefined)?.trim();

        // Block A.1 — IP-basiertes Rate-Limit (10 Login-Versuche/Min/IP)
        // Schuetzt vor distributed Brute-Force über viele Accounts.
        const ip = request ? getClientIp(request as Request) : 'unknown';
        const ipCheck = loginRateLimit.check(`login:${ip}`, 10);
        if (!ipCheck.success) {
          return null;
        }

        // v2.6: Email- ODER Username-Lookup (Public Name).
        const isEmail = identifier.includes('@');
        const user = isEmail
          ? await prisma.user.findUnique({ where: { email: identifier.toLowerCase() } })
          : await prisma.user.findUnique({ where: { username: identifier } });

        if (!user) {
          // Constant-Time-Pattern: trotzdem bcrypt-Compare laufen lassen,
          // damit Timing-Attacks nicht zwischen "User existiert nicht" und
          // "Passwort falsch" unterscheiden können.
          await bcrypt.compare(password, '$2b$12$dummyHashToPreventTimingAttack000000000000000000000');
          await logSecurityEvent('login_failed', {
            request: request as Request,
            metadata: { reason: 'unknown_email' },
          });
          return null;
        }

        if (!user.isActive) {
          await logSecurityEvent('login_failed', {
            userId: user.id,
            request: request as Request,
            metadata: { reason: 'inactive' },
          });
          return null;
        }

        // Block A.2 — Account-Lockout-Check
        if (isAccountLocked(user.lockedUntil)) {
          await logSecurityEvent('login_failed', {
            userId: user.id,
            request: request as Request,
            metadata: { reason: 'locked', lockedUntil: user.lockedUntil },
          });
          return null;
        }

        // Passwort vergleichen
        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
          // Fehlversuch zaehlen + ggf. Account sperren
          const newAttempts = user.failedLoginAttempts + 1;
          const shouldLock = newAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
          const lockUntil = shouldLock ? computeLockoutUntil() : null;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: newAttempts,
              lockedUntil: lockUntil,
            },
          });
          await logSecurityEvent('login_failed', {
            userId: user.id,
            request: request as Request,
            metadata: { reason: 'wrong_password', failedAttempts: newAttempts },
          });
          if (shouldLock) {
            await logSecurityEvent('account_locked', {
              userId: user.id,
              request: request as Request,
              metadata: { lockoutUntil: lockUntil, attempts: newAttempts },
            });
          }
          return null;
        }

        // Block C — 2FA-Verify wenn aktiviert
        if (user.twoFactorEnabled) {
          if (!totpCode) {
            // UI erkennt "2FAREQUIRED"-Fehler über NextAuth-Error-Field
            // und zeigt dann das TOTP-Eingabefeld.
            throw new Error('TWO_FACTOR_REQUIRED');
          }

          let totpValid = false;

          // Variante 1a: 6-stelliger TOTP-Code (Authenticator-App-Methode)
          if (/^\d{6}$/.test(totpCode) && user.twoFactorMethod === 'totp' && user.twoFactorSecret) {
            try {
              const secret = decryptSecret(user.twoFactorSecret);
              const totp = new OTPAuth.TOTP({
                issuer: 'KaboomKartell',
                label: user.email,
                algorithm: 'SHA1',
                digits: 6,
                period: 30,
                secret: OTPAuth.Secret.fromBase32(secret),
              });
              const delta = totp.validate({ token: totpCode, window: 1 });
              totpValid = delta !== null;
            } catch {
              totpValid = false;
            }
          }

          // Variante 1b: 6-stelliger Email-OTP (v2.7)
          if (
            !totpValid &&
            /^\d{6}$/.test(totpCode) &&
            user.twoFactorMethod === 'email' &&
            user.twoFactorEmailCode &&
            isEmailOtpValid(user.twoFactorEmailExpiry)
          ) {
            try {
              const ok = await bcrypt.compare(totpCode, user.twoFactorEmailCode);
              if (ok) {
                totpValid = true;
                // Code verbrauchen — one-time-use
                await prisma.user.update({
                  where: { id: user.id },
                  data: { twoFactorEmailCode: null, twoFactorEmailExpiry: null },
                });
                await logSecurityEvent('2fa_email_used', {
                  userId: user.id,
                  request: request as Request,
                });
              }
            } catch {
              totpValid = false;
            }
          }

          // Variante 2: Backup-Code (Format XXXXX-XXXXX, 11 chars)
          if (!totpValid && user.twoFactorBackupCodes) {
            try {
              const hashes = JSON.parse(user.twoFactorBackupCodes) as string[];
              const matchIdx = await verifyBackupCode(totpCode, hashes);
              if (matchIdx >= 0) {
                // Used Backup-Code aus Liste entfernen (one-time-use)
                hashes.splice(matchIdx, 1);
                await prisma.user.update({
                  where: { id: user.id },
                  data: { twoFactorBackupCodes: JSON.stringify(hashes) },
                });
                totpValid = true;
              }
            } catch {
              totpValid = false;
            }
          }

          if (!totpValid) {
            // 2FA-Fail zaehlt auch als Login-Fehlversuch
            const newAttempts = user.failedLoginAttempts + 1;
            const shouldLock = newAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
            const lockUntil = shouldLock ? computeLockoutUntil() : null;
            await prisma.user.update({
              where: { id: user.id },
              data: {
                failedLoginAttempts: newAttempts,
                lockedUntil: lockUntil,
              },
            });
            await logSecurityEvent('2fa_verify_failed', {
              userId: user.id,
              request: request as Request,
              metadata: { failedAttempts: newAttempts },
            });
            if (shouldLock) {
              await logSecurityEvent('account_locked', {
                userId: user.id,
                request: request as Request,
                metadata: { lockoutUntil: lockUntil, attempts: newAttempts, via: '2fa' },
              });
            }
            return null;
          }

          // Wenn Backup-Code statt TOTP genutzt wurde: explizit loggen
          // (User soll wissen, dass ein Code "verbraucht" wurde).
          if (totpCode.length > 6) {
            await logSecurityEvent('2fa_backup_used', {
              userId: user.id,
              request: request as Request,
            });
          }
        }

        // Erfolgreiches Login: Fehlversuche resetten + log
        if (user.failedLoginAttempts > 0 || user.lockedUntil) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: 0,
              lockedUntil: null,
            },
          });
        }
        await logSecurityEvent('login_success', {
          userId: user.id,
          request: request as Request,
          metadata: { with2FA: user.twoFactorEnabled },
        });

        // User-Objekt für die Session zurückgeben.
        // tokenVersion wandert ins JWT (Block B — Logout-all-Devices).
        return {
          id: user.id,
          email: user.email,
          name: user.displayName || user.username,
          role: user.role,
          username: user.username,
          tokenVersion: user.tokenVersion,
          trustTier: user.trustTier,
        };
      },
    }),
  ],
});
