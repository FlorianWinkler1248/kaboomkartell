-- Track-Request-Feature entfernt (19.06.2026).
-- Crowd Control (ADR-026/033) deckt das gewuenschte Voting-Modell bereits ab
-- (das uebernaechste Lied aus 5 Pool-Kandidaten); die Wunschliste fuer externe
-- Kuenstler-Vorschlaege passt nicht zum kuratierten Hausparty-Konzept und wird
-- ersatzlos verworfen. Es gab nie ein oeffentliches Eingabe-Frontend -> kein
-- relevanter Datenbestand. Reihenfolge: Votes zuerst (FK auf track_requests).

DROP TABLE IF EXISTS "track_request_votes";
DROP TABLE IF EXISTS "track_requests";
