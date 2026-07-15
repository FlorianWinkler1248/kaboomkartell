-- v2.30 Twitch-Anbindung (ADR-005 Sektion E + F)
-- Zwei additive nullable Spalten — kein Datenverlust, kein Backfill nötig.
--
-- User.twitchChannel: Anzeige-Channel für Artist-Streams (z. B. "4flow_live").
--   Nur Display-Feld, verifiziertes OAuth-Linking läuft separat über
--   LinkedAccount.
--
-- SiteSettings.twitchChannel: KBK-eigener Twitch-Channel-Login (z. B. "kbk4flow").
--   Wenn gesetzt und Helix-API sagt "live", übernimmt der Embed den Player
--   auf /artists und im Radio.

ALTER TABLE "users" ADD COLUMN "twitchChannel" TEXT;
ALTER TABLE "site_settings" ADD COLUMN "twitchChannel" TEXT;
