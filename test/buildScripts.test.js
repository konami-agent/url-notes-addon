import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildExtensionZip } from '../scripts/build-zip.js';
import { validateExtension } from '../scripts/validate-extension.js';

function listZipEntries(buffer) {
  const entries = [];
  let offset = 0;

  while (offset < buffer.length - 4) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;

    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraFieldLength = buffer.readUInt16LE(offset + 28);
    const fileNameStart = offset + 30;
    const fileNameEnd = fileNameStart + fileNameLength;
    entries.push(buffer.subarray(fileNameStart, fileNameEnd).toString('utf8'));
    offset = fileNameEnd + extraFieldLength + compressedSize;
  }

  return entries;
}

test('validateExtension accepts the checked-in extension package', async () => {
  const result = await validateExtension(new URL('..', import.meta.url));

  assert.equal(result.manifestVersion, 3);
  assert.equal(result.defaultPopup, 'popup/popup.html');
  assert.ok(result.checkedFiles.includes('src/popup.js'));
});

test('buildExtensionZip creates a distributable archive with extension files', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'url-notes-addon-'));

  try {
    const result = await buildExtensionZip({
      projectRoot: new URL('..', import.meta.url),
      outputDir,
    });

    const archive = await readFile(result.outputPath);
    const entries = listZipEntries(archive);

    assert.equal(result.fileName, 'url-notes-addon-0.1.0.zip');
    assert.ok(entries.includes('manifest.json'));
    assert.ok(entries.includes('popup/popup.html'));
    assert.ok(entries.includes('src/popup.js'));
    assert.ok(!entries.some((entry) => entry.startsWith('.git/')));
    assert.ok(!entries.some((entry) => entry.endsWith('/.gitkeep')));
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
