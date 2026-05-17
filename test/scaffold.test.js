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
  assert.match(readme, /saved-notes list shows URL notes and domain notes/i);
});

test('ci workflow uses action versions that have migrated off Node.js 20 runtime', async () => {
  const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

  assert.match(workflow, /uses: actions\/checkout@v6/);
  assert.match(workflow, /uses: actions\/setup-node@v6/);
  assert.match(workflow, /uses: actions\/upload-artifact@v7/);
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
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /dist\/\*\.zip/);
  assert.match(readme, /GitHub Release/i);
  assert.match(readme, /url-notes-addon-0\.1\.0\.zip/);
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

  for (const nextPhaseTopic of [
    /search/i,
    /domain notes/i,
    /ignore-query/i,
    /markdown preview/i,
    /floating note/i,
  ]) {
    assert.match(options, nextPhaseTopic);
  }
});
