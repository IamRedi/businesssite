# Website engine boundary

Input: `PreparedBusinessProfile`. Output: `SiteDocument`.

The engine may validate input, normalize content, select category templates and themes, fill safe defaults and map starter media. It may not:

- Read environment variables.
- Perform HTTP or provider requests.
- Read or write a database.
- Authorize a user or manage sessions.
- Charge a customer or interpret webhook events.
- Import Next.js, React or product-specific owner code.

Adapters may persist both contracts and invoke the engine. Changes to either contract require compatibility tests, migration-impact review and documentation updates.
