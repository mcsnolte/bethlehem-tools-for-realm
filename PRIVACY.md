# Privacy — Bethlehem Tools for Realm

This unofficial Bethlehem Realm utility processes names entered or loaded by the user and sends them to Bethlehem's Realm site to retrieve matches and, only after Save new query is clicked, create a saved report.

It uses the current Realm session. Request-verification tokens stay inside the Realm content-script operation. The extension does not read passwords, export cookies, use analytics, contact an independent server, or persist the input names or returned profiles in extension storage. Inputs and matching results remain in the extension window's memory until it is closed. Only identity and name columns are passed to that window from the results response. Saved reports remain in Realm and are subject to Realm's own retention and permissions.

The browser's activeTab permission is temporary and granted when the user invokes the extension. The implementation checks that the target is https://onrealm.org/BethlehemWELS/ before sending any requests. It does not modify existing profiles or reports.

Chrome Web Store submission is complete and approved for unlisted distribution. This document describes the extension’s data handling.

Header-mapped file import is processed locally. Only the selected name columns enter Realm requests; unmapped file columns are ignored. Group and volunteer import entries are inactive placeholders.
