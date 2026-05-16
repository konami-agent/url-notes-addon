# Next-phase Options

These are possible next steps after the v0.1 popup-only release. They are intentionally scoped as options, not commitments.

## Option A — Search and note overview

Add a popup or extension page that lists saved notes and supports search by note text and URL key.

- User value: makes the extension useful after a user has accumulated more than a few notes.
- Suggested scope: local-only search over `browser.storage.local`, no external indexing service.
- Risks: larger UI surface and pagination/empty-state decisions.
- Good first acceptance criteria: user can open a note list, search for text, and jump back to a matching URL key.

## Option B — Domain notes

Support notes attached to a domain such as `example.com`, separate from full normalized URL notes.

- User value: captures site-level reminders that apply across many pages.
- Suggested scope: keep domain notes as a separate storage namespace from URL notes.
- Risks: must clearly show whether the user is editing the domain note or the page-specific note.
- Good first acceptance criteria: popup can display and edit one domain note for the active tab host.

## Option C — Ignore-query setting

Add an optional setting that lets users ignore query strings when deriving note keys.

- User value: reduces duplicate notes caused by tracking parameters or search/session query strings.
- Suggested scope: a local setting with a clear warning that changing it changes future note-key lookup behavior.
- Risks: migration and collision behavior need careful design because v0.1 preserves query strings.
- Good first acceptance criteria: tests prove the default still preserves query strings, while the opt-in setting drops them.

## Option D — Markdown preview

Add a preview mode for notes written in markdown.

- User value: improves readability for structured notes, checklists, and links.
- Suggested scope: render a safe subset locally; avoid remote rendering services.
- Risks: HTML sanitization and dependency choice matter for extension security.
- Good first acceptance criteria: preview renders headings, lists, emphasis, and links without executing scripts or inline event handlers.

## Option E — Floating note

Add an optional content-script floating note panel on the current page.

- User value: lets users read and edit notes without opening the toolbar popup repeatedly.
- Suggested scope: explicit user toggle, local storage only, and minimal host-page interference.
- Risks: content-script permissions and CSS isolation are more complex than popup-only v0.1.
- Good first acceptance criteria: user can open a floating panel on the active page, edit the same normalized URL note, and close it without changing page layout permanently.

## Suggested ordering

1. Search and note overview, because it improves usability without changing key semantics.
2. Ignore-query setting, but only after writing migration/collision acceptance tests.
3. Domain notes, because it introduces a second note scope and needs clear UI language.
4. Markdown preview, after deciding the sanitizer/dependency policy.
5. Floating note, last among these options because it expands permissions and runtime surface area.
