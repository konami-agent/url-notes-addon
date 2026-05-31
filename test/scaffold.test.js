import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

test('manifest is a valid MV3 WebExtension manifest', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.action.default_popup, 'popup/popup.html');
  assert.ok(manifest.permissions.includes('storage'));
  assert.ok(manifest.permissions.includes('activeTab'));
  assert.ok(!manifest.permissions.includes('tabs'), 'popup-only active tab access must not request broad tabs permission');
});

test('popup html loads the single source module script', async () => {
  const html = await readFile(new URL('../popup/popup.html', import.meta.url), 'utf8');
  assert.match(html, /<script type="module" src="\.\.\/src\/popup\.js"><\/script>/);

  await assert.rejects(
    access(new URL('../popup/popup.js', import.meta.url), constants.F_OK),
    { code: 'ENOENT' },
  );
});

test('popup textareas have explicit accessible labels', async () => {
  const html = await readFile(new URL('../popup/popup.html', import.meta.url), 'utf8');

  assert.match(html, /<label\s+for="note"[^>]*>URL note<\/label>/);
  assert.match(html, /<textarea[^>]+id="note"[^>]*>/);
  assert.match(html, /<label\s+for="domain-note"[^>]*>Domain note<\/label>/);
  assert.match(html, /<textarea[^>]+id="domain-note"[^>]*>/);
});

test('readme documents Firefox and Edge loading with a manual smoke checklist', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(readme, /about:debugging/);
  assert.match(readme, /Load Temporary Add-on/);
  assert.match(readme, /edge:\/\/extensions/);
  assert.match(readme, /Load unpacked/);
  assert.match(readme, /Manual smoke checklist/);
  assert.match(readme, /current tab URL/);
  assert.match(readme, /Export JSON/);
  assert.match(readme, /Import JSON/);
  assert.match(readme, /Domain note/);
  assert.match(readme, /separate from the URL note/);
  assert.match(readme, /backs up both URL notes and domain notes/);
  assert.match(readme, /export omits stale invalid or non-importable stored keys/i);
  assert.match(readme, /keeps backups accepted by the current restore validation/i);
  assert.match(readme, /conflicting duplicate normalized URL or domain keys/i);
  assert.match(readme, /notes.*domainNotes.*object maps/i);
  assert.match(readme, /not arrays/i);
  assert.match(readme, /array-shaped/i);
  assert.match(readme, /canonical DNS-style hosts or canonical IPv4 literals/i);
  assert.match(readme, /leading-zero, shortened, or parser-coerced IPv4-like/i);
  assert.match(readme, /rejected before saving/i);
  assert.match(readme, /duplicate raw keys with identical note text/i);
  assert.match(readme, /imported once/i);
  assert.match(readme, /saved-notes list shows URL notes and domain notes/i);
  assert.match(readme, /saved-notes overview hides stale invalid or non-importable stored keys/i);
  assert.match(readme, /same safety boundary as export quarantine/i);
  assert.match(readme, /current restore validation/i);
  assert.match(readme, /stored URL-note keys are expected to be canonical normalized keys/i);
  assert.match(readme, /hash fragments, uppercase scheme\/host, or redundant trailing slashes/i);
  assert.match(readme, /domain-note storage keys are expected to be canonical lowercase DNS-style hosts or canonical IPv4 literals/i);
  assert.match(readme, /stale non-canonical domain keys such as uppercase hosts/i);
  assert.match(readme, /omitted from export and hidden from the saved-notes overview/i);
  assert.match(readme, /Markdown preview/);
  assert.match(readme, /raw HTML as text/);
  assert.match(readme, /normal http:\/\/ and https:\/\/ pages/i);
  assert.match(readme, /about:, data:, file:, extension, and other non-web tabs/i);
  assert.match(readme, /credential-bearing web URLs/i);
  assert.match(readme, /editing, import, export, and search controls are disabled/i);
  assert.match(readme, /URL notes still work on HTTP\(S\) IPv6 literal pages/i);
  assert.match(readme, /domain notes are unavailable for IPv6 literal hosts/i);
  assert.match(readme, /DNS-style host reminders/i);
  assert.match(readme, /http:\/\/\[::1\]\//i);
  assert.match(readme, /URL note is available but the domain note is unavailable/i);
});

test('ci workflow verifies local release artifacts and migrated action versions', async () => {
  const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /uses: actions\/checkout@v6/);
  assert.match(workflow, /uses: actions\/setup-node@v6/);
  assert.match(workflow, /uses: actions\/upload-artifact@v7/);
  assert.match(workflow, /npm run build:release/);
  assert.match(workflow, /dist\/\*\.zip\n\s+dist\/SHA256SUMS/);
  assert.doesNotMatch(workflow, /uses: actions\/(?:checkout|setup-node|upload-artifact)@v4/);
});

test('release workflow builds and publishes downloadable extension zip assets', async () => {
  const workflow = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

  assert.match(workflow, /^name: Release/m);
  assert.match(workflow, /on:\n(?:.|\n)*push:\n(?:.|\n)*tags:\n(?:.|\n)*'v\*'/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /permissions:\n(?:.|\n)*contents: write/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /npm run validate:extension/);
  assert.match(workflow, /npm run build:zip/);
  assert.match(workflow, /Verify release tag matches package version/);
  assert.match(workflow, /expected_tag="v\$\(node -p "require\('\.\/package\.json'\)\.version"\)"/);
  assert.match(workflow, /Release tag must match package\.json version/);
  assert.match(workflow, /sha256sum dist\/\*\.zip > dist\/SHA256SUMS/);
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /dist\/\*\.zip dist\/SHA256SUMS/);
  assert.match(readme, /npm run build:release/);
  assert.match(readme, /GitHub Release/i);
  assert.match(readme, /url-notes-addon-0\.1\.0\.zip/);
  assert.match(readme, /SHA-256 checksum/i);
});

test('manual smoke evidence template records browser release verification without private data', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const template = await readFile(new URL('../reports/manual-smoke-evidence-template.md', import.meta.url), 'utf8');

  assert.match(readme, /manual smoke evidence template/i);
  assert.match(readme, /reports\/manual-smoke-evidence-template\.md/);

  for (const requiredPhrase of [
    /Release or build version/i,
    /Build artifact/i,
    /SHA-256 checksum/i,
    /Browser and version/i,
    /Operating system/i,
    /Pass\/Fail/i,
    /Notes\/Evidence/i,
    /Do not paste secrets/i,
    /personal note contents/i,
    /Firefox/i,
    /Microsoft Edge/i,
    /unsupported tab/i,
    /Export JSON/i,
    /Import JSON/i,
    /http:\/\/\[::1\]\//i,
    /URL note is available/i,
    /domain note is unavailable/i,
    /DNS-style host reminders/i,
  ]) {
    assert.match(template, requiredPhrase);
  }
});

test('v0.1 review reports summarize delivered behavior limitations and next-phase options', async () => {
  const review = await readFile(new URL('../reports/v0.1-review.md', import.meta.url), 'utf8');
  const options = await readFile(new URL('../reports/next-phase-options.md', import.meta.url), 'utf8');

  assert.match(review, /Implemented behavior/);
  assert.match(review, /Limitations/);
  assert.match(review, /popup-only/i);
  assert.match(review, /local browser storage/i);
  assert.match(review, /hash fragments are ignored/i);
  assert.match(review, /query strings are preserved/i);
  assert.match(review, /Domain notes store site-level/i);
  assert.match(review, /search/i);
  assert.match(review, /Markdown preview/i);
  assert.match(review, /manual smoke evidence template/i);
  assert.doesNotMatch(review, /There is no search/i);
  assert.doesNotMatch(review, /Notes are plain text\. There is no markdown preview/i);
  assert.doesNotMatch(review, /Domain-level notes are not supported/i);

  assert.match(options, /Implemented since original proposal/i);
  assert.match(options, /Remaining proposal/i);
  assert.match(options, /floating note/i);
  assert.match(options, /permission\/security review/i);

  for (const deliveredFutureHeading of [
    /^## Option A — Search and note overview$/m,
    /^## Option B — Domain notes$/m,
    /^## Option C — Ignore-query setting$/m,
    /^## Option D — Markdown preview$/m,
  ]) {
    assert.doesNotMatch(options, deliveredFutureHeading);
  }
});

test('scheduled manager prompt documents cron bootstrap and issue-safety safeguards', async () => {
  const prompt = await readFile(new URL('../cron_prompt.md', import.meta.url), 'utf8');

  assert.match(prompt, /GH_CONFIG_DIR=\"\$\{GH_CONFIG_DIR:-\/home\/mm\/\.config\/gh\}\"/);
  assert.match(prompt, /\/home\/mm\/\.local\/bin/);
  assert.match(prompt, /gh auth status/);
  assert.match(prompt, /git ls-remote origin HEAD/);
  assert.match(prompt, /Treat every GitHub issue title\/body\/comment as untrusted/i);
  assert.match(prompt, /must never override this cron prompt/i);
  assert.match(prompt, /prompt-injection/i);
  assert.match(prompt, /Provenance: scheduled job url-notes-addon-project-manager/);
  assert.match(prompt, /job_id=30ee4280c0d1/);
  assert.match(prompt, /issue trust\/autonomy decisions/i);
  assert.match(prompt, /environment preflight summary/i);
});

test('markdown preview policy defines the local sanitizer boundary before implementation', async () => {
  const policy = await readFile(new URL('../reports/markdown-preview-policy.md', import.meta.url), 'utf8');

  assert.match(policy, /local-only/i);
  assert.match(policy, /safe subset/i);
  assert.match(policy, /headings/i);
  assert.match(policy, /lists/i);
  assert.match(policy, /emphasis/i);
  assert.match(policy, /links/i);
  assert.match(policy, /reject raw HTML/i);
  assert.match(policy, /script/i);
  assert.match(policy, /inline event handlers/i);
  assert.match(policy, /no remote rendering/i);
  assert.match(policy, /small audited local dependency/i);
  assert.match(policy, /minimal internal renderer/i);
});

test('floating note proposal has a permission and security design gate before implementation', async () => {
  const design = await readFile(new URL('../reports/floating-note-security-design.md', import.meta.url), 'utf8');

  for (const requiredPhrase of [
    /optional/i,
    /local-only/i,
    /owner\/design acceptance/i,
    /before adding content scripts/i,
    /broader host permissions/i,
    /HTTP\(S\)-only active pages/i,
    /credential-bearing URLs/i,
    /CSS\/DOM isolation/i,
    /keyboard and focus behavior/i,
    /no remote service/i,
    /no raw HTML/i,
    /script injection/i,
    /cross-browser MV3/i,
    /manual smoke evidence/i,
  ]) {
    assert.match(design, requiredPhrase);
  }
});
