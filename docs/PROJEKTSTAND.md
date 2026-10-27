# Projektstand / Project status

**Stand: 27. Oktober 2026.**

## Kurzfassung

BusinessSite RC ist eine B2B-Plattform für Websites kleiner Betriebe: anlegen in unter einer Minute, danach selbst pflegen. Der technische Kern ist fertig und läuft seit dem 20. Oktober 2026 auf einem eigenen Server in Frankfurt. Der kommerzielle Verkauf an fremde Kunden ist bewusst noch nicht freigegeben.

## Verlauf

| Zeitraum | Schritt |
|---|---|
| August 2026 | Abspaltung als eigenständiges Produkt mit eigener Datenbank, reiner Website-Engine und Self-Service-Demo (Version 0.1.0) |
| August bis September 2026 | Plattform-Admin mit Passwort, TOTP und Rollen; Stripe-Lebenszyklus; Datenschutz-Export und Kundenlöschung; Row-Level Security mit getrennten Datenbankrollen |
| September bis Oktober 2026 | Branchenvorlagen und Design-System, KI-Import bestehender Websites, Terminbuchung, News-CMS, eigene Medien für Kundenseiten |
| 20. Oktober 2026 | Umzug von Vercel/Neon auf einen eigenen Server mit verschlüsselter PostgreSQL-Datenbank, Backups und Watchdog |
| 27. Oktober 2026 | Öffentlicher, bereinigter Schnappschuss (dieses Repository) |

## Offen vor dem Verkauf

- Anwaltliche Prüfung von AGB, Datenschutzerklärung und Auftragsverarbeitungsvertrag.
- Safari/WebKit-Abnahme auf echten Geräten (Telefon, Tablet, angemeldete Bereiche).
- Vollständige Abnahme aller E-Mails (Willkommen, Einladung, Passwort, Termine) im Postfach.
- 30 tägliche Wiederherstellungspunkte und eine dokumentierte Wiederherstellungsübung.
- Anzeigefehler aus dem [Prüfprotokoll](../EVIDENCE.md).

## Grenzen

Kein SSO, keine frei definierbaren Rollen. Externe Dienste (Stripe, Resend, Google, OpenAI, Speicher) brauchen eigene Konten des Betreibers. Lasttests gibt es nicht.
