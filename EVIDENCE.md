# Prüfprotokoll / Verification record

**Stand: 27. Oktober 2026.** Dieses Protokoll trennt, was gemessen wurde, von dem, was nur im Code vorhanden ist.

## Herkunft des Codes

| Punkt | Wert |
|---|---|
| Quelle | privates Repository, Branch `master`, Commit `05bcd3d` (26.10.2026) |
| In Produktion laufender Anwendungscode | `fcf670a`, ein Vorgänger auf demselben Branch. Danach kamen nur Betriebsskripte, Dokumentation und eine Performance-Änderung (`eb73341`, doppelte Seitenauflösung pro Render entfernt), die noch nicht ausgerollt ist. |
| Abhängigkeiten | `npm audit` meldete am 27.10.2026 neue Lücken (u. a. Next.js 16.3.8 kritisch, undici, zod, vitest). Im Schnappschuss behoben: Next.js 16.4.3, undici 6.29.1, vitest 4.1.12, zod 4.6.7 (auch als Override für `@vercel/cli-config`). Danach 0 Befunde und alle Prüfungen unten erneut grün. Die Produktion läuft noch mit den alten Versionen. |
| Bereinigung für die Veröffentlichung | interne Aufgaben- und Nachweisordner, Betriebshandbücher, Server-/Datenbank-/Speicherkennungen, Produktions-Workflows mit privatem Runner und Testdaten echter Betriebe entfernt bzw. durch erfundene Werte ersetzt. Tests, die nur gegen entfernte Nachweisdateien liefen, wurden gelöscht. |

## Automatisierte Prüfungen (lokal, 27.10.2026)

Linux-Container, Node 22, PostgreSQL 16, gegen genau diesen Schnappschuss.

| Schritt | Ergebnis |
|---|---|
| TypeScript (`npm run typecheck`, alle Workspaces) | bestanden |
| ESLint | bestanden, 0 Fehler, 2 Warnungen |
| Unit- und Integrationstests (`npm test`, mit Datenbank) | **1.199 bestanden**, 2 übersprungen |
| Durchgesetzte Row-Level Security (`npm run test:rls`, Wegwerf-Datenbank, eingeschränkte Rollen) | **172 bestanden** in 14 Dateien |
| Upgrade-Erhalt 049 → 052 (`npm run test:rls-upgrade`) | bestanden |
| Doku-Links (`npm run check:docs`) | bestanden |
| Produktionsbuild (`next build`) | bestanden |
| `npm audit --audit-level=moderate` | 0 Befunde |
| gitleaks 8.21 über den ganzen Baum und den einzigen Commit | keine Funde |

Dieselben Schritte laufen in GitHub Actions (`.github/workflows/ci.yml`) auf `ubuntu-latest` mit PostgreSQL-Service-Containern, dazu ein eigener gitleaks-Job.

## Manuelle Prüfungen

| Prüfung | Beobachtung |
|---|---|
| Durchgang im Browser (Playwright/Chromium, lokaler Produktionsbuild, 27.10.2026) | Drei fiktive Betriebe über den Assistenten angelegt (Haarstudio Elena, Autowerkstatt Brückner, Café Morgenrot): jeweils Website in wenigen Sekunden erzeugt, privater Vorschau-Link geöffnet, Business-Admin per Passwort betreten, Editor geöffnet. Screenshots in `docs/assets`, jedes Bild einzeln angesehen. |
| Gefundene Anzeigefehler (27.10.2026, behoben im zweiten Pull Request) | Lange deutsche Firmennamen wurden in der Hero-Überschrift mitten im Wort umgebrochen („AUTOW / ERKSTA / TT“), jetzt Silbentrennung nach Seitensprache („AUTO- / WERK- / STATT“). Der deutsche Standardtext „Eine lokale Friseursalon“ war grammatisch falsch; die Texte in DE/FR/ES/IT sind jetzt unabhängig vom Genus der Branche. Auf dunklen Paletten war der Kontaktknopf fast unsichtbar; der Knopf wählt jetzt automatisch eine Farbe mit ausreichendem Kontrast (3 neue Tests). Alle drei im Browser nachgeprüft, Screenshots ersetzt. |
| Bewusst so, kein Fehler | Der Business-Admin folgt der Oberflächensprache des Besuchers (Cookie bzw. Browsersprache, EN oder DE), nicht der Sprache der erzeugten Website. Kleiner Rest: Der Knopf „Mit AI verbessern“ folgt der Website-Sprache und steht deshalb in einem englischen Admin auf Deutsch. Für „Café“ gibt es keine eigene Branchenvorlage; es wird die neutrale Vorlage ohne Bild verwendet. |
| Schnellstart | Zwei Lücken in `docs/QUICK_START.md` gefunden und ergänzt: Die drei Rollen-URLs sind Pflicht, und `PUBLIC_APP_URL` muss zur Adresse im Browser passen, sonst lehnt der Same-Origin-Schutz den Login ab. |

## Was nicht geprüft ist

- **Externe Dienste.** Stripe, Resend, Google Places, OpenAI und Medienspeicher waren nicht konfiguriert. Ihr Code ist mit Test-Doubles abgedeckt; ein Live-Aufruf wurde für diese Fassung nicht gemacht.
- **Produktion.** An Server, Datenbank und Deployments der Produktion wurde nichts geändert oder gemessen. Aussagen zum Produktionsbetrieb stammen aus der privaten Betriebsdokumentation.
- **Safari/WebKit auf echten Geräten** und Last- und Skalierungstests.
- **Rechtstexte.** Die AGB-, Datenschutz- und AVV-Entwürfe sind nicht anwaltlich geprüft und deshalb nicht Teil dieses Repositorys.

## Daten und Rechte

Alle Betriebe, Namen, E-Mail-Adressen und Telefonnummern in Tests und Screenshots sind erfunden. Die Vorlagenbilder sind für dieses Projekt mit KI erzeugt (siehe [Asset-Register](docs/ASSET_AND_LICENSE_AUDIT.md)).
