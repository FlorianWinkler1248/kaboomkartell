/**
 * Discord-Webhook-Helper — ADR-005 Sektion D (Discord-Stufe-1)
 *
 * Einseitige Spiegelung: KBK postet Events in den Discord-Channel #radio-feed.
 * Kein Bot, kein OAuth — nur ein eingehender Webhook.
 *
 * - Die Webhook-URL kommt aus DISCORD_WEBHOOK_RADIO_FEED (geheim, Server-.env).
 *   Fehlt sie, no-op't postToDiscord() sauber — das Feature ist dann schlicht
 *   inaktiv, analog zum "Coming Soon"-Fallback der Twitch-Anbindung.
 * - DISCORD_WEBHOOK_DRY_RUN=true → der Payload wird nur geloggt, nicht
 *   gesendet. Damit ist der ganze Pfad testbar, bevor eine echte Webhook-URL
 *   existiert.
 *
 * Aufrufer (Boomy-Wall-Post, Slot-Wechsel) sollten postToDiscord() zwar
 * awaiten (sonst kann die Runtime den fetch abbrechen), das Ergebnis aber nur
 * loggen: ein Webhook-Fehler darf nie den eigentlichen KBK-Request kippen.
 */

const WEBHOOK_ENV = 'DISCORD_WEBHOOK_RADIO_FEED';

// Discord-Embed — nur die Felder, die wir tatsächlich nutzen.
export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number; // Dezimal-RGB — siehe hexToDiscordColor()
  timestamp?: string; // ISO-8601
  thumbnail?: { url: string };
  footer?: { text: string };
}

export interface DiscordWebhookPayload {
  content?: string;
  embeds?: DiscordEmbed[];
  // username/avatar_url überschreiben den Webhook-Default pro Nachricht.
  username?: string;
  avatar_url?: string;
}

/** Wandelt einen Hex-String ("#8B5CF6") in Discords Dezimal-Farbwert. */
export function hexToDiscordColor(hex: string): number {
  return parseInt(hex.replace(/^#/, ''), 16);
}

function isDryRun(): boolean {
  return process.env.DISCORD_WEBHOOK_DRY_RUN === 'true';
}

/**
 * Postet eine Nachricht in den Discord-#radio-feed.
 *
 * Wirft nie — gibt true zurück bei Erfolg (oder Dry-Run), false wenn nicht
 * konfiguriert oder der Post fehlschlug. Caller hängen ihren Flow nicht daran auf.
 */
export async function postToDiscord(payload: DiscordWebhookPayload): Promise<boolean> {
  if (isDryRun()) {
    console.info('[discord-webhook] DRY-RUN — würde posten:', JSON.stringify(payload));
    return true;
  }

  const url = process.env[WEBHOOK_ENV];
  if (!url) {
    // Kein Webhook konfiguriert → Feature inaktiv, kein Fehler.
    return false;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(
        '[discord-webhook] post failed',
        res.status,
        await res.text().catch(() => '<no body>'),
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error('[discord-webhook] post crashed:', err);
    return false;
  }
}
