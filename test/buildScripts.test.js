import test from 'node:test';
import assert from 'node:assert/strict';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
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

async function copyProjectFixture() {
  const projectRoot = await mkdtemp(join(tmpdir(), 'url-notes-addon-validate-'));
  await mkdir(join(projectRoot, 'popup'), { recursive: true });
  await mkdir(join(projectRoot, 'src'), { recursive: true });
  await mkdir(join(projectRoot, 'icons'), { recursive: true });
  await Promise.all([
    cp(new URL('../manifest.json', import.meta.url), join(projectRoot, 'manifest.json')),
    cp(new URL('../package.json', import.meta.url), join(projectRoot, 'package.json')),
    cp(new URL('../popup/popup.html', import.meta.url), join(projectRoot, 'popup', 'popup.html')),
    cp(new URL('../popup/popup.css', import.meta.url), join(projectRoot, 'popup', 'popup.css')),
    cp(new URL('../src/browserApi.js', import.meta.url), join(projectRoot, 'src', 'browserApi.js')),
    cp(new URL('../src/urlNotes.js', import.meta.url), join(projectRoot, 'src', 'urlNotes.js')),
    cp(new URL('../src/popup.js', import.meta.url), join(projectRoot, 'src', 'popup.js')),
    cp(new URL('../src/markdownPreview.js', import.meta.url), join(projectRoot, 'src', 'markdownPreview.js')),
    cp(new URL('../icons/icon.svg', import.meta.url), join(projectRoot, 'icons', 'icon.svg')),
    cp(new URL('../LICENSE', import.meta.url), join(projectRoot, 'LICENSE')),
    cp(new URL('../README.md', import.meta.url), join(projectRoot, 'README.md')),
  ]);
  return projectRoot;
}

test('validateExtension accepts the checked-in extension package', async () => {
  const result = await validateExtension(new URL('..', import.meta.url));

  assert.equal(result.manifestVersion, 3);
  assert.equal(result.defaultPopup, 'popup/popup.html');
  assert.ok(result.checkedFiles.includes('src/popup.js'));
});

test('validateExtension rejects package and manifest version mismatches', async () => {
  const projectRoot = await copyProjectFixture();

  try {
    const packageJsonPath = join(projectRoot, 'package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    packageJson.version = '0.2.0';
    await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

    await assert.rejects(
      validateExtension(projectRoot),
      /package\.json version must match manifest version/u,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('validateExtension rejects incomplete manifest identity metadata', async () => {
  const projectRoot = await copyProjectFixture();

  try {
    const manifestPath = join(projectRoot, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.name = 'Private Page Notes';
    manifest.description = '';
    delete manifest.action.default_title;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await assert.rejects(
      validateExtension(projectRoot),
      /manifest identity metadata must include URL Notes name, description, and action title/u,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('validateExtension rejects missing required manifest icon files', async () => {
  const projectRoot = await copyProjectFixture();

  try {
    const manifestPath = join(projectRoot, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.icons['128'] = 'icons/missing.svg';
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await assert.rejects(
      validateExtension(projectRoot),
      /manifest icons must include readable 48 and 128 icon files/u,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('validateExtension rejects required manifest icons outside packaged icon assets', async () => {
  const projectRoot = await copyProjectFixture();

  try {
    const manifestPath = join(projectRoot, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.icons['48'] = 'README.md';
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await assert.rejects(
      validateExtension(projectRoot),
      /manifest icons must point to packaged SVG icon assets under icons\//u,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('validateExtension rejects broad host permissions', async () => {
  const projectRoot = await copyProjectFixture();

  try {
    const manifestPath = join(projectRoot, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.host_permissions = ['<all_urls>'];
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await assert.rejects(
      validateExtension(projectRoot),
      /host_permissions must stay empty/u,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('validateExtension rejects unexpected manifest permissions', async () => {
  const projectRoot = await copyProjectFixture();

  try {
    const manifestPath = join(projectRoot, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.permissions = ['storage', 'activeTab', 'tabs'];
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await assert.rejects(
      validateExtension(projectRoot),
      /manifest permissions must stay limited to storage and activeTab/u,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('validateExtension rejects background service workers', async () => {
  const projectRoot = await copyProjectFixture();

  try {
    const manifestPath = join(projectRoot, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.background = { service_worker: 'src/background.js' };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await assert.rejects(
      validateExtension(projectRoot),
      /manifest must remain popup-only for v0\.1/u,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('validateExtension rejects options pages', async () => {
  const projectRoot = await copyProjectFixture();

  try {
    const manifestPath = join(projectRoot, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.options_ui = { page: 'options/options.html' };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await assert.rejects(
      validateExtension(projectRoot),
      /manifest must remain popup-only for v0\.1/u,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('validateExtension rejects sidebar actions', async () => {
  const projectRoot = await copyProjectFixture();

  try {
    const manifestPath = join(projectRoot, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.sidebar_action = { default_panel: 'sidebar/sidebar.html' };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await assert.rejects(
      validateExtension(projectRoot),
      /manifest must remain popup-only for v0\.1/u,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('validateExtension rejects side panels', async () => {
  const projectRoot = await copyProjectFixture();

  try {
    const manifestPath = join(projectRoot, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.side_panel = { default_path: 'side-panel/panel.html' };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await assert.rejects(
      validateExtension(projectRoot),
      /manifest must remain popup-only for v0\.1/u,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('validateExtension rejects other non-popup manifest surfaces', async () => {
  const nonPopupSurfaces = [
    ['devtools_page', 'devtools/devtools.html'],
    ['chrome_url_overrides', { newtab: 'newtab/newtab.html' }],
    ['commands', { open: { suggested_key: { default: 'Ctrl+Shift+Y' } } }],
    ['externally_connectable', { matches: ['https://example.com/*'] }],
  ];

  for (const [key, value] of nonPopupSurfaces) {
    const projectRoot = await copyProjectFixture();

    try {
      const manifestPath = join(projectRoot, 'manifest.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      manifest[key] = value;
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      await assert.rejects(
        validateExtension(projectRoot),
        /manifest must remain popup-only for v0\.1/u,
      );
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  }
});

test('validateExtension rejects web-accessible resources', async () => {
  const projectRoot = await copyProjectFixture();

  try {
    const manifestPath = join(projectRoot, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.web_accessible_resources = [{ resources: ['icons/icon.svg'], matches: ['<all_urls>'] }];
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await assert.rejects(
      validateExtension(projectRoot),
      /manifest must remain popup-only for v0\.1/u,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('validateExtension rejects custom content security policies', async () => {
  const projectRoot = await copyProjectFixture();

  try {
    const manifestPath = join(projectRoot, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.content_security_policy = {
      extension_pages: "script-src 'self'; object-src 'self'; connect-src *",
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await assert.rejects(
      validateExtension(projectRoot),
      /manifest must not define a custom content_security_policy for local-only v0\.1/u,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('validateExtension rejects remote URLs in packaged extension files', async () => {
  const projectRoot = await copyProjectFixture();

  try {
    await writeFile(join(projectRoot, 'src', 'popup.js'), 'fetch("https://example.com/collect");\n');

    await assert.rejects(
      validateExtension(projectRoot),
      /remote URL found in packaged extension file/u,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('validateExtension rejects protocol-relative remote URLs in packaged extension files', async () => {
  const projectRoot = await copyProjectFixture();

  try {
    await writeFile(join(projectRoot, 'popup', 'popup.css'), '.remote { background-image: url("//example.com/pixel.png"); }\n');

    await assert.rejects(
      validateExtension(projectRoot),
      /remote URL found in packaged extension file: popup\/popup\.css/u,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('validateExtension rejects WebSocket remote URLs in packaged extension files', async () => {
  const projectRoot = await copyProjectFixture();

  try {
    await writeFile(join(projectRoot, 'src', 'popup.js'), 'const socket = new WebSocket("wss://example.com/socket");\n');

    await assert.rejects(
      validateExtension(projectRoot),
      /remote URL found in packaged extension file: src\/popup\.js/u,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('validateExtension rejects remote URLs in packaged SVG icons', async () => {
  const projectRoot = await copyProjectFixture();

  try {
    await writeFile(join(projectRoot, 'icons', 'icon.svg'), '<svg><image href="https://example.com/icon.png" /></svg>\n');

    await assert.rejects(
      validateExtension(projectRoot),
      /remote URL found in packaged extension file: icons\/icon\.svg/u,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('validateExtension rejects remote URLs in the packaged markdown preview module', async () => {
  const projectRoot = await copyProjectFixture();

  try {
    await writeFile(join(projectRoot, 'src', 'markdownPreview.js'), 'const remoteHelp = "https://example.com/help";\n');

    await assert.rejects(
      validateExtension(projectRoot),
      /remote URL found in packaged extension file: src\/markdownPreview\.js/u,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('validateExtension scans newly packaged source modules for remote URLs', async () => {
  const projectRoot = await copyProjectFixture();

  try {
    await writeFile(join(projectRoot, 'src', 'futureModule.js'), 'const remoteHelp = "https://example.com/help";\n');

    await assert.rejects(
      validateExtension(projectRoot),
      /remote URL found in packaged extension file: src\/futureModule\.js/u,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('validateExtension reports newly packaged source modules in checkedFiles', async () => {
  const projectRoot = await copyProjectFixture();

  try {
    await writeFile(join(projectRoot, 'src', 'futureModule.js'), 'export const localOnly = true;\n');

    const result = await validateExtension(projectRoot);

    assert.ok(result.checkedFiles.includes('src/futureModule.js'));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('validateExtension rejects inline event handlers in packaged HTML', async () => {
  const projectRoot = await copyProjectFixture();

  try {
    await writeFile(
      join(projectRoot, 'popup', 'popup.html'),
      '<!doctype html><button type="button" onclick="alert(1)">Unsafe</button><script type="module" src="../src/popup.js"></script>\n',
    );

    await assert.rejects(
      validateExtension(projectRoot),
      /inline event handler found in packaged HTML file: popup\/popup\.html/u,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('validateExtension rejects inline script blocks in packaged HTML', async () => {
  const projectRoot = await copyProjectFixture();

  try {
    await writeFile(
      join(projectRoot, 'popup', 'popup.html'),
      '<!doctype html><div>Unsafe inline script</div><script>alert(1)</script><script type="module" src="../src/popup.js"></script>\n',
    );

    await assert.rejects(
      validateExtension(projectRoot),
      /inline script block found in packaged HTML file: popup\/popup\.html/u,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('validateExtension rejects unexpected script sources in packaged HTML', async () => {
  const projectRoot = await copyProjectFixture();

  try {
    await writeFile(
      join(projectRoot, 'popup', 'popup.html'),
      '<!doctype html><script src="../src/extra.js"></script><script type="module" src="../src/popup.js"></script>\n',
    );

    await assert.rejects(
      validateExtension(projectRoot),
      /unexpected script source found in packaged HTML file: popup\/popup\.html/u,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('buildExtensionZip refuses to create an archive when extension validation fails', async () => {
  const projectRoot = await copyProjectFixture();
  const outputDir = await mkdtemp(join(tmpdir(), 'url-notes-addon-invalid-build-'));

  try {
    const manifestPath = join(projectRoot, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.version = '0.2.0';
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await assert.rejects(
      buildExtensionZip({ projectRoot, outputDir }),
      /package\.json version must match manifest version/u,
    );
    await assert.rejects(
      access(join(outputDir, 'url-notes-addon-0.1.0.zip'), constants.F_OK),
      { code: 'ENOENT' },
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('buildExtensionZip refuses unsupported files under packaged roots', async () => {
  const projectRoot = await copyProjectFixture();
  const outputDir = await mkdtemp(join(tmpdir(), 'url-notes-addon-unsupported-build-'));

  try {
    await writeFile(join(projectRoot, 'src', 'debug.log'), 'temporary local debug notes\n');

    await assert.rejects(
      buildExtensionZip({ projectRoot, outputDir }),
      /unsupported packaged file type: src\/debug\.log/u,
    );
    await assert.rejects(
      access(join(outputDir, 'url-notes-addon-0.1.0.zip'), constants.F_OK),
      { code: 'ENOENT' },
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });
  }
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
