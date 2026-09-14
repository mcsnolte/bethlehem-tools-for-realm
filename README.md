# Bethlehem Tools for Realm

Chrome extension for building a custom query from a list of names and opening unsaved results in Realm. Runs in Chrome's side panel using the user's existing Bethlehem Realm session. Includes CSV/TSV header mapping; reviewing people, editing, saving, and other actions happen on Realm's results page. Group and volunteer tools are inactive placeholders.

## Distribution and use

Chrome Web Store submission is complete and approved for **unlisted** distribution. Install using the listing link shared by the publisher.

1. Sign in to Bethlehem Realm and open Custom Query or My Saved Reports.
2. Click the extension icon and choose **Query from a name list**. Keep the signed-in Realm tab open.
3. Paste names or load a CSV, TSV, or text file. For files with headers, check **First row contains column headers** and select the name columns. CSV files default to header mode.
4. Leave **Also match preferred names** enabled to match first or preferred names, or turn it off to match first names only. Click **Open results in Realm**. The signed-in Realm tab navigates to the unsaved query's results page.
5. Review the people and use Realm's own controls to edit the query, save it if desired, or perform other actions.

Without headers, enter one name per line as `Morgan Example`, `Example, Morgan`, or two tab-separated columns (given name, surname). Use `van Example, Morgan Lee` for compound names. Header-mapped imports support separate first/preferred and last-name columns, or one full-name column with exactly one name per cell. Excel workbook files are not supported.

The extension validates the query and submits Realm's unsaved-query form in the current Realm tab. It does not fetch profiles into the panel or create a saved report. Results may include multiple people with the same name; review them in Realm before taking further actions. If validation fails, correct the input or sign in again and retry.

## Repository contents

This entire folder is the repository root. It includes extension source, icons, development scripts, synthetic tests, and documentation. No earlier Python/Playwright prototype, downloaded reports, HAR captures, name lists, or browser-session folders are required. Do not copy the surrounding Codex workspace into the repository.

`dist/` is generated and ignored by Git. Release ZIPs can be attached to GitHub Releases instead of committed. Keep `manifest.json` under version control: it is the single source of truth for the release version and date. `package.json` only supplies development commands; it does not declare a separate package version.

## Make commands

From the repository root, use GNU Make with Node.js 20+ and Python 3.10+:

```sh
make                       # Show available commands
make test                  # Run all tests and build the current version
make release               # Run all tests, bump patch, and build the release ZIP
make release BUMP=minor     # Use instead for a feature release
make release BUMP=major     # Use instead for a breaking release
make build                 # Rebuild without another version bump
make version               # Show the version and date
```

Run **one** release command per version. It stops if tests fail and only bumps after they pass. The ZIP path is printed when the build finishes. Commit/tag and Chrome Web Store submission remain manual steps. `make test` runs both test suites and builds the current version without bumping it.

The commands default to `node` and `python3`. Override them if needed, for example `make test PYTHON="py -3"` with GNU Make on Windows. Without Make, use the direct commands below.

## Build (Mac and Windows)

Requires Python 3.10+. No Python packages or npm installation are needed for building.

```sh
# Mac/Linux
python3 scripts/build.py
python3 scripts/build.py --bump patch
python3 scripts/build.py --bump minor
python3 scripts/build.py --version 1.0.0

# Windows
py -3 scripts/build.py
py -3 scripts/build.py --bump patch
```

Run only ONE bump command per release. `--bump patch` advances 0.2.4 to 0.2.5, `minor` to 0.3.0, and `major` to 1.0.0. A version change stamps today's local date into `version_name`, which the UI reads automatically. A plain build preserves both version and date. Commit the updated manifest with the change.

Build outputs:

- `dist/unpacked/`: select this folder in Chrome → Extensions → Developer mode → Load unpacked. After rebuilding, click Reload in Chrome and reopen the side panel.
- `dist/bethlehem-tools-VERSION.zip`: upload this directly to the Chrome Web Store. Unlike the earlier handoff ZIPs, it has `manifest.json` at the archive root. It contains runtime files only, using an explicit allowlist in the build script. Add new runtime files to that list when extending the app.

The build replaces `dist/unpacked` and the ZIP for the same version. It does not publish, commit, or push anything. Do not edit generated files.

## Tests

Requires Node.js 20+. No third-party packages needed.

```sh
npm test
# or
node --test

# Packaging regression tests (use py -3 on Windows)
python3 -m unittest discover -s tests -p "*_test.py"
```

These portable tests use fictional names and synthetic response data. They cover CSV parsing, header mapping, limits, query construction, validation, session failures, native results-form submission, and panel state during navigation and file imports. Panel tests run the actual event handlers against a minimal DOM and mocked Chrome API. Packaging tests use disposable repository copies and verify archive contents, version bumps, and failed-build behavior.

GitHub Actions runs the JavaScript tests, packaging tests, and a plain build on Linux and Windows. No dependency installation is required. These checks do not replace live Realm testing or browser UI checks.

## Release checklist

1. Finish source changes and live-test the changed behavior.
2. Run `make release` once (or set `BUMP=minor` / `BUMP=major`). It runs both test suites before bumping and packaging.
3. Reload `dist/unpacked` and check the changed behavior in Realm.
4. Commit source and manifest; optionally tag the version.
5. Upload the generated ZIP to the existing Chrome Web Store listing.

## Current limits

Bethlehem site only. Header-mapped imports support up to 50 distinct names; plain name lists support up to 50 nonblank lines. Matching uses first name plus surname, with optional preferred-name matching enabled by default, and excludes inactive and deceased profiles. Review same-name matches using Realm's controls. Queries remain name-based, so future profiles can affect results. The native results-page handoff has been live-tested in Realm. See PRIVACY.md for data handling. The existing store listing is approved for unlisted distribution; release updates follow the checklist above.
