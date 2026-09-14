# Privacy — Bethlehem Tools for Realm

This unofficial Bethlehem Realm utility processes names entered or loaded by the user. Clicking Open results in Realm sends the name query to Bethlehem's Realm site for validation and opens an unsaved results page in the user's signed-in Realm tab. Reviewing people, editing, saving, and other actions are performed by the user within Realm.

It uses the current Realm session. Request-verification tokens stay in the Realm tab and are submitted only to Realm. The extension does not read passwords, export cookies, use analytics, contact an independent server, or persist input names in extension storage. Inputs remain in the extension panel's memory until it is closed. The extension does not retrieve matching profiles into its panel or create saved reports. Query results and any reports the user saves in Realm are subject to Realm's own retention and permissions.

The browser's activeTab permission is temporary and granted when the user invokes the extension. The implementation checks that the target is https://onrealm.org/BethlehemWELS/ before sending any requests. It does not modify existing profiles or reports.

Chrome Web Store submission is complete and approved for unlisted distribution. This document describes the extension’s data handling.

Header-mapped file import is processed locally. Only the selected name columns enter Realm requests; unmapped file columns are ignored. Group and volunteer import entries are inactive placeholders.
