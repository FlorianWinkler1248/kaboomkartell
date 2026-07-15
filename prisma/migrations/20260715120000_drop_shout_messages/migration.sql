-- Shoutbox-Feature vollstaendig entfernt (15.07.2026, v1.0-Vorbereitung).
-- Das Frontend war bereits am 14.07. entfernt; API-Route, Zod-Schemas und das
-- MCP-Tool get_shoutbox folgen mit diesem Stand. Die Tabelle traegt keinen fuer
-- v1.0 relevanten Datenbestand. shout_messages hat keine Kind-Tabellen (nur eine
-- FK auf users) -> ein einzelnes DROP genuegt.

DROP TABLE IF EXISTS "shout_messages";
