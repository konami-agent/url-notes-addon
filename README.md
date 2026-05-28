# URL Notes Add-on

`url-notes-addon` is a Firefox and Microsoft Edge WebExtension for storing notes per normalized page URL.

## v0.1 scope

- Popup-only UI.
- Local browser storage only.
- Per-URL notes keyed by a normalized URL.
- Domain notes store site-level reminders separately from the URL note for the current page.
- Hash fragments are ignored; query strings are preserved by default.
- A local popup setting can ignore query strings for future note-key lookups when tracking/search parameters create duplicates.
- JSON export/import is available from the popup.
- Markdown preview renders a small safe local subset and treats raw HTML as text.
- The popup lists saved URL notes and domain notes, then filters them locally by key or note text.
- No account, remote sync, or external service.

## Supported active tabs

URL notes and domain notes are available on normal http:// and https:// pages. The extension intentionally does not create note keys for about:, data:, file:, extension, and other non-web tabs, and it also rejects credential-bearing web URLs such as `https://user@example.com/`.

When the current tab is unsupported, the popup reports that URL notes are unavailable and the editing, import, export, and search controls are disabled. Existing notes remain in local browser storage and can still be used from supported web pages.

## Export/import JSON

Use **Export JSON** in the popup to download a schema-versioned backup file. The backup backs up both URL notes and domain notes:

```json
{
  "schemaVersion": 1,
  "notes": {
    "https://example.com/page?query=1": "Example note"
  },
  "domainNotes": {
    "example.com": "Site-level note"
  }
}
```

Use **Import JSON** to merge a backup into local extension storage. Imported URL notes are normalized with the same URL-key rules as saved notes. Imported domain notes are normalized to lowercase host keys. If an imported URL or domain normalizes to an existing note key, the imported note overwrites the existing note for that key. Blank imported notes are ignored. Invalid files and conflicting duplicate normalized URL or domain keys are rejected before saving, so existing notes are not partially corrupted. Duplicate raw keys with identical note text may be collapsed and imported once.

## Development

```bash
npm test
npm run lint
npm run validate:extension
npm run build:zip
npm run build:release
```

`npm run build:zip` writes the distributable extension archive to `dist/`. `npm run build:release` writes the same deterministic zip plus `dist/SHA256SUMS` for local release review.

## Download a release build

Tagged releases are built automatically by GitHub Actions. Open the project's GitHub Release page, choose the desired version, and download the extension asset such as `url-notes-addon-0.1.0.zip` from the release assets.

The release workflow runs tests, lint, extension validation, and `npm run build:zip` before publishing the zip asset. It also publishes a `SHA256SUMS` asset so reviewers can compare the downloaded zip with the SHA-256 checksum produced by CI.

## Load unpacked during development

Firefox:

1. Open `about:debugging`.
2. Choose “This Firefox”.
3. Click “Load Temporary Add-on”.
4. Select this repository's `manifest.json`.

Microsoft Edge:

1. Open `edge://extensions`.
2. Enable Developer mode.
3. Click “Load unpacked”.
4. Select this repository directory.

## Manual smoke checklist

After loading the extension in Firefox or Edge:

1. Open a normal web page and click the URL Notes toolbar button.
2. Confirm the popup shows the current tab URL and the normalized note key.
3. Type a URL note, wait for the saved status, close the popup, and reopen it on the same URL to confirm the note reloads.
4. Type a **Domain note**, wait for the domain-note saved status, then open another page on the same host and confirm the domain note reloads separate from the URL note.
5. Open a different normalized URL and confirm it has a different URL note.
6. Confirm the saved-notes list shows URL notes and domain notes, then search by URL/domain text and by note text.
7. Toggle **Ignore query strings for note keys**, confirm the displayed key drops or restores the query string, and confirm the warning says existing notes are not migrated.
8. Confirm the URL note and domain note Markdown preview renders headings, lists, emphasis, code, and safe links while showing raw HTML as text.
9. Click a listed URL key and confirm it opens as a normal link without changing the stored notes.
10. Clear the URL note text and confirm the saved URL note is deleted.
11. Clear the domain note text and confirm only the domain note is deleted.
12. Use **Export JSON** and confirm a schema-versioned `.json` file downloads.
13. Use **Import JSON** with a valid backup and confirm the current note reloads from imported data.
14. Try an invalid JSON import and confirm the popup reports an error without losing existing notes.
15. Open an unsupported tab such as `about:debugging`, `edge://extensions`, or a local `file:` page, then confirm the popup says URL notes are unavailable and the editing, import, export, and search controls are disabled.

For release or cross-browser review, copy `reports/manual-smoke-evidence-template.md` as a manual smoke evidence template and record only synthetic/redacted notes, browser versions, artifact checksums, pass/fail results, and follow-up issue links.

## Privacy

Notes are stored in local browser extension storage. The extension does not send notes to a server.
