import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('manifest is a valid MV3 WebExtension manifest', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.action.default_popup, 'popup/popup.html');
  assert.ok(manifest.permissions.includes('storage'));
});
