# Secret scanning

Run `npm run check:secrets` before every release. It scans only Git-tracked source and configuration files for high-confidence credential formats; it never opens `.env.local`.

Markdown and `.env.example` are excluded so variable names and safe placeholders can be documented. This is a guardrail, not a replacement for secret rotation or Git-hosting secret scanning. If a secret is committed, revoke it immediately, follow an approved history-removal incident process and record the incident before release.
