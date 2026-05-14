# URL Notes Add-on

`url-notes-addon` is a Firefox and Microsoft Edge WebExtension for storing notes per normalized page URL.

## v0.1 scope

- Popup-only UI.
- Local browser storage only.
- Per-URL notes keyed by a normalized URL.
- Hash fragments are ignored; query strings are preserved.
- JSON export/import is planned for the first release.
- No account, remote sync, or external service.

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
