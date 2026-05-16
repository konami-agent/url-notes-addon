# URL Notes Add-on

`url-notes-addon` is a Firefox and Microsoft Edge WebExtension for storing notes per normalized page URL.

## v0.1 scope

- Popup-only UI.
- Local browser storage only.
- Per-URL notes keyed by a normalized URL.
- Hash fragments are ignored; query strings are preserved.
- JSON export/import is available from the popup.
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
```

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

## Privacy

Notes are stored in local browser extension storage. The extension does not send notes to a server.
