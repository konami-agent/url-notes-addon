# Floating Note Security Design Gate

This note records the minimum design and security boundary for the optional floating note proposal before any runtime implementation. It is a guardrail, not approval to add a content script.

## Decision status

- Status: proposal/design gate only.
- Scope: optional UI that may let a user open a note panel on the active page.
- Storage: local-only browser extension storage, reusing the existing URL-note key rules.
- Required approval gate: owner/design acceptance is required before adding content scripts, broader host permissions, web-accessible resources, commands, side panels, background workers, or any other execution surface beyond the current popup.

## Permission boundary

The current v0.1 extension is popup-only and intentionally requests only `storage` and `activeTab`. A floating-note implementation would be a meaningful expansion because it would execute code in the page context as an extension content script or injected surface.

Before implementation, a follow-up issue must specify the narrowest permission model, expected manifest changes, and rollback plan. Broad host permissions such as `<all_urls>` are not acceptable by default. If a content script is needed, it should be activated only by an explicit user action on the active tab and should be limited to supported HTTP(S)-only active pages.

## URL and storage safety

- Supported pages: normal HTTP(S)-only active pages.
- Unsupported pages: `about:`, `data:`, `file:`, extension pages, browser settings pages, and other non-web URLs.
- Credential-bearing URLs such as `https://user@example.com/` or `https://user:pass@example.com/` remain unsupported.
- Floating-note reads and writes must use the same normalized URL-note store as the popup. It must not introduce a second normalization path.
- No remote service, account login, telemetry, cloud sync, or external rendering service may be added as part of this feature.

## DOM, CSS, and script boundary

A future panel must minimize host-page interference:

- Use a contained root and predictable teardown so closing the panel removes its nodes and event listeners.
- Prefer strong CSS/DOM isolation. A Shadow DOM root is the default candidate, but implementation tests must verify it does not break Firefox/Edge behavior.
- Avoid global CSS resets or selectors that can affect the host page.
- Do not execute page-provided strings as code.
- Do not render note text as raw HTML. Markdown, if reused, must pass through the existing local sanitizer boundary.
- Prevent script injection and inline event handler injection. All UI event handlers should be attached through DOM APIs controlled by extension code.

## Interaction and accessibility boundary

A floating note can easily disrupt the page. A future design must define and test:

- explicit open and close behavior;
- keyboard and focus behavior, including a predictable way to leave the panel;
- whether Escape closes the panel;
- focus return to the page after closing;
- how autosave status is communicated without stealing focus;
- z-index and positioning constraints that do not permanently change page layout.

## Verification required before runtime implementation

A later implementation issue must add tests before production code and keep the release boundary verifiable:

1. Manifest/scaffold tests for the exact permission and entrypoint changes.
2. Unit tests proving HTTP(S)-only and credential-bearing URL rejection use the same URL normalization as the popup.
3. DOM tests showing panel creation, close teardown, CSS/DOM isolation, and keyboard/focus behavior.
4. Security tests showing no raw HTML/script injection from note content.
5. Cross-browser MV3 manual smoke evidence for Firefox and Microsoft Edge, recorded with the existing privacy-safe manual smoke evidence template.

Until those tests and the owner/design acceptance gate exist, floating-note runtime code should remain unimplemented.
