# Markdown Preview Sanitizer Policy

This policy defines the security boundary for a future markdown preview feature before any preview renderer is implemented.

## Goal and scope

Markdown preview must remain local-only. Notes are rendered inside the extension UI from `browser.storage.local` / `chrome.storage.local` data only. There must be no remote rendering, no external preview service, no telemetry service, and no login or sync requirement.

## Initial safe subset

The first implementation should render only a small safe subset:

- headings
- unordered and ordered lists
- emphasis and strong emphasis
- inline code and fenced code blocks rendered as text
- links, only when the normalized destination is an `http:` or `https:` URL

Anything outside the subset should be rendered as plain text until there is a tested reason to expand it.

## Sanitizer boundary

The renderer must reject raw HTML and treat it as text. In particular, it must not create DOM nodes from user-provided HTML strings and must reject or neutralize:

- `<script>` tags and script-like URL schemes such as `javascript:` and `data:`
- inline event handlers such as `onclick`, `onerror`, or any other `on*` attribute
- embedded frames, images, styles, forms, or arbitrary attributes not required by the safe subset

Rendered links must use safe URL validation before assigning `href`, and external links must keep `rel="noopener noreferrer"` when opened in a new tab.

## Dependency policy

Prefer one of these two approaches, in order:

1. a minimal internal renderer that explicitly supports only the safe subset above; or
2. a small audited local dependency with no remote runtime behavior, pinned through `package-lock.json`, and covered by tests for script, raw HTML, inline event handlers, and unsafe link schemes.

Do not use a dependency that requires network access at runtime, injects unsanitized HTML into the DOM, or expands the rendered markdown surface beyond the tested safe subset by default.

## Acceptance tests for implementation

Before implementing markdown preview UI, add behavior tests that prove:

- raw HTML is displayed as text rather than interpreted;
- script tags and inline event handlers are not executable DOM attributes;
- `javascript:` and `data:` links are not clickable;
- valid `http:` and `https:` links remain clickable with `noopener noreferrer`;
- preview rendering works offline and does not call external services.
