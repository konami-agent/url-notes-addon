import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const requiredPaths = [
  'manifest.json',
  'popup/popup.html',
  'popup/popup.css',
  'src/browserApi.js',
  'src/urlNotes.js',
  'src/popup.js',
  'test/scaffold.test.js',
  'scripts/validate_project_state.py',
  'scripts/lint.js',
  'scripts/validate-extension.js',
  'scripts/build-zip.js',
  '.github/workflows/ci.yml',
  '.github/workflows/release.yml',
  'icons/icon.svg',
  'README.md',
  'LICENSE',
];

const forbiddenPatterns = [
  /BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY/,
  /GITHUB_TOKEN\s*=/,
  /AKIA[0-9A-Z]{16}/,
];

async function main() {
  for (const path of requiredPaths) {
    await access(path, constants.R_OK);
  }

  const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
  if (manifest.manifest_version !== 3) throw new Error('manifest_version must be 3');
  if (manifest.action?.default_popup !== 'popup/popup.html') {
    throw new Error('manifest action.default_popup must be popup/popup.html');
  }

  for (const path of ['README.md', 'manifest.json', 'package.json']) {
    const text = await readFile(path, 'utf8');
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(text)) {
        throw new Error(`Potential secret pattern found in ${path}`);
      }
    }
  }

  console.log('Extension structure OK');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
