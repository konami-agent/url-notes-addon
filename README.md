# URL Notes Add-on

`url-notes-addon` is a Firefox and Microsoft Edge WebExtension for storing notes per normalized page URL.

## v0.1 scope

- Popup-only UI.
- Local browser storage only.
- Per-URL notes keyed by a normalized URL.
- Hash fragments are ignored; query strings are preserved by default.
- A local popup setting can ignore query strings for future note-key lookups when tracking/search parameters create duplicates.
- JSON export/import is available from the popup.
- The popup lists saved notes and filters them locally by URL or note text.
- No account, remote sync, or external service.

## Export/import JSON

Use **Export JSON** in the popup to download a schema-versioned backup file:

```json
{
  "schemaVersion": 1,
  "notes": {
    "https://example.com/page?query=1": "Example note"
  }
}
```

Use **Import JSON** to merge a backup into local extension storage. Imported notes are normalized with the same URL-key rules as saved notes. If an imported URL normalizes to an existing note key, the imported note overwrites the existing note for that key. Blank imported notes are ignored. Invalid files are rejected before saving, so existing notes are not partially corrupted.

## Development

```bash
npm test
npm run lint
npm run validate:extension
npm run build:zip
```

`npm run build:zip` writes the distributable extension archive to `dist/`.

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
3. Type a note, wait for the saved status, close the popup, and reopen it on the same URL to confirm the note reloads.
4. Open a different normalized URL and confirm it has a different note.
5. Confirm the saved-notes list shows existing URL keys, then search by URL text and by note text.
6. Toggle **Ignore query strings for note keys**, confirm the displayed key drops or restores the query string, and confirm the warning says existing notes are not migrated.
7. Click a listed URL key and confirm it opens as a normal link without changing the stored notes.
8. Clear the note text and confirm the saved note is deleted.
9. Use **Export JSON** and confirm a schema-versioned `.json` file downloads.
10. Use **Import JSON** with a valid backup and confirm the current note reloads from imported data.
11. Try an invalid JSON import and confirm the popup reports an error without losing existing notes.

## Privacy

Notes are stored in local browser extension storage. The extension does not send notes to a server.
