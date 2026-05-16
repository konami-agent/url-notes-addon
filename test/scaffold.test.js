import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

test('manifest is a valid MV3 WebExtension manifest', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.action.default_popup, 'popup/popup.html');
  assert.ok(manifest.permissions.includes('storage'));
});

test('popup html loads the single source module script', async () => {
  const html = await readFile(new URL('../popup/popup.html', import.meta.url), 'utf8');
  assert.match(html, /<script type="module" src="\.\.\/src\/popup\.js"><\/script>/);

  await assert.rejects(
    access(new URL('../popup/popup.js', import.meta.url), constants.F_OK),
    { code: 'ENOENT' },
  );
});
