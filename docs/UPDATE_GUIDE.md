# Update guide

1. Record the running commit and take a verified database backup/recovery point.
2. Check out the buyer-approved release tag in a staging clone.
3. Compare `.env.example`; preserve buyer secrets, branding and buyer stylesheet.
4. Run `npm ci`, `npm run setup:check`, `npm run migrate`, `npm run migrate:status` and `npm run quality`.
5. Deploy compatible code, run `npm run smoke`, then test owner login, a preview token and an active public site.
6. If application rollback is necessary, return to the previous compatible release. Do not reverse applied migrations during an incident; restore only from a verified backup.

Keep buyer changes in configuration or an external stylesheet where possible. Source forks need a normal Git merge review for every update.
