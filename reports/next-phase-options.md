# Next-phase Options

These are possible next steps after the v0.1 popup-only release. They are intentionally scoped as options, not commitments. This report now separates ideas that were already delivered from remaining future proposals so scheduled work does not re-plan completed features.

## Implemented since original proposal

The following options from the original next-phase list have been implemented in the local-only popup scope and are summarized in `reports/v0.1-review.md`:

- Search and note overview: the popup lists saved URL notes and domain notes and supports local search by key and note text.
- Domain notes: the popup stores site-level notes in a separate domain-note namespace for the active HTTP(S) host.
- Ignore-query setting: a local opt-in setting can ignore query strings for future URL-note lookups while preserving query strings by default.
- Markdown preview: URL notes and domain notes can render a small local safe Markdown subset, with raw HTML treated as text and no remote rendering service.

These delivered features remain subject to normal maintenance, bug fixes, and release verification, but they should not be selected as new product-direction options without a more specific follow-up issue.

## Remaining proposal — Floating note

Add an optional content-script floating note panel on the current page.

- User value: lets users read and edit notes without opening the toolbar popup repeatedly.
- Suggested scope: explicit user toggle, local storage only, and minimal host-page interference.
- Risks: content-script permissions, CSS isolation, host-page interaction, keyboard focus behavior, and cross-browser MV3 behavior are more complex than popup-only v0.1.
- Required gate before implementation: separate permission/security review, because this would expand the extension beyond the current popup-only execution surface.
- Good first acceptance criteria after approval/splitting: user can open a floating panel on the active HTTP(S) page, edit the same normalized URL note, and close it without changing page layout permanently.

## Suggested ordering

1. Keep the already-delivered popup features stable through bug fixes, import/export hardening, packaging checks, and manual browser smoke evidence.
2. If a larger UX increment is desired, split the floating note proposal into a design/security issue first, then implementation issues only after the permission/security review is accepted.
3. Avoid remote sync, account login, store publishing, or additional execution surfaces unless explicitly approved in project files or a future owner decision.
