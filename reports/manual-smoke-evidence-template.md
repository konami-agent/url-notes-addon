# Manual smoke evidence template

Use this template when manually checking a local or release build of URL Notes Add-on in Firefox and Microsoft Edge. Store completed evidence only when it contains no secrets, private credentials, browser-profile data, or personal note contents.

## Build context

- Release or build version: `<version or commit>`
- Build artifact: `<dist/url-notes-addon-...zip or unpacked repository path>`
- SHA-256 checksum: `<checksum from dist/SHA256SUMS or release asset>`
- Source commit: `<git sha>`
- Tester/date: `<name or initials, date>`

## Environment

| Browser | Browser and version | Operating system | Extension load method | Pass/Fail | Notes/Evidence |
| --- | --- | --- | --- | --- | --- |
| Firefox |  |  | Temporary add-on via `about:debugging` |  |  |
| Microsoft Edge |  |  | Load unpacked via `edge://extensions` |  |  |

## Privacy reminder

Do not paste secrets, access tokens, private credentials, browser profile paths, personal note contents, or private URLs into this evidence. Use synthetic examples such as `https://example.com/page?query=1` and redact screenshots before attaching them anywhere.

## Smoke checklist evidence

| # | Check | Pass/Fail | Notes/Evidence |
| --- | --- | --- | --- |
| 1 | Confirm the URL Notes toolbar icon is recognizable at toolbar size and matches the refreshed multi-size release icon assets. |  |  |
| 2 | Open a normal web page and click the URL Notes toolbar button. |  |  |
| 3 | Confirm the popup shows the current tab URL and the normalized note key. |  |  |
| 4 | Type a URL note, wait for saved status, close/reopen the popup on the same URL, and confirm the note reloads. |  |  |
| 5 | Click Open floating note and confirm a contained page panel appears with the same URL note. |  |  |
| 6 | Edit the floating note, confirm the popup reloads the same note for that normalized URL, then press Escape or click Close and confirm the panel is removed. |  |  |
| 7 | Type a Domain note, wait for saved status, then open another page on the same host and confirm the domain note reloads separate from the URL note. |  |  |
| 8 | Open a different normalized URL and confirm it has a different URL note. |  |  |
| 9 | Confirm the saved-notes list shows URL notes and domain notes, then search by URL/domain text and by note text. |  |  |
| 10 | Toggle Ignore query strings for note keys, confirm the displayed key drops/restores the query string, and confirm the warning says existing notes are not migrated. |  |  |
| 11 | Confirm URL note and domain note Markdown preview renders headings, lists, emphasis, code, and safe links while showing raw HTML as text. |  |  |
| 12 | Click a listed URL key and confirm it opens as a normal link without changing stored notes. |  |  |
| 13 | Clear the URL note text and confirm the saved URL note is deleted. |  |  |
| 14 | Clear the domain note text and confirm only the domain note is deleted. |  |  |
| 15 | Use Export JSON and confirm a schema-versioned `.json` file downloads. |  |  |
| 16 | Use Import JSON with a valid backup and confirm the current note reloads from imported data. |  |  |
| 17 | Try an invalid JSON import and confirm the popup reports an error without losing existing notes. |  |  |
| 18 | Open `http://[::1]/` or another HTTP(S) IPv6 literal page only if one is locally available, then confirm the URL note is available but the domain note is unavailable because domain notes are DNS-style host reminders. |  |  |
| 19 | Open an unsupported tab such as `about:debugging`, `edge://extensions`, or a local `file:` page, then confirm the popup says URL notes are unavailable and the editing, import, export, and search controls are disabled. |  |  |

## Result summary

- Overall Pass/Fail:
- Follow-up issues created:
- Reviewer notes:
