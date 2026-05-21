import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const requiredFiles = [
  'manifest.json',
  'popup/popup.html',
  'popup/popup.css',
  'src/browserApi.js',
  'src/urlNotes.js',
  'src/popup.js',
  'icons/icon.svg',
];

const packagedCodeFiles = [
  'manifest.json',
  'popup/popup.html',
  'popup/popup.css',
  'src/browserApi.js',
  'src/urlNotes.js',
  'src/popup.js',
];

export async function validateExtension(projectRoot = new URL('..', import.meta.url)) {
  const root = projectRoot instanceof URL ? fileURLToPath(projectRoot) : projectRoot;

  for (const file of requiredFiles) {
    await access(resolve(root, file), constants.R_OK);
  }

  const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
  if (manifest.manifest_version !== 3) {
    throw new Error('manifest_version must be 3');
  }
  if (manifest.action?.default_popup !== 'popup/popup.html') {
    throw new Error('manifest action.default_popup must be popup/popup.html');
  }
  if (!manifest.permissions?.includes('storage')) {
    throw new Error('manifest permissions must include storage');
  }
  if (Array.isArray(manifest.host_permissions) && manifest.host_permissions.length > 0) {
    throw new Error('manifest host_permissions must stay empty for local-only v0.1');
  }
  if (Array.isArray(manifest.content_scripts) && manifest.content_scripts.length > 0) {
    throw new Error('manifest content_scripts must stay empty for popup-only v0.1');
  }

  const popupHtml = await readFile(resolve(root, 'popup/popup.html'), 'utf8');
  if (!popupHtml.includes('<script type="module" src="../src/popup.js"></script>')) {
    throw new Error('popup must load ../src/popup.js as its module script');
  }

  for (const file of packagedCodeFiles) {
    const contents = await readFile(resolve(root, file), 'utf8');
    if (/https?:\/\/(?!\$\{)/iu.test(contents)) {
      throw new Error(`remote URL found in packaged extension file: ${file}`);
    }
  }

  return {
    manifestVersion: manifest.manifest_version,
    defaultPopup: manifest.action.default_popup,
    checkedFiles: [...requiredFiles],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  validateExtension()
    .then((result) => {
      console.log(`Extension validation OK (${result.checkedFiles.length} files checked)`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
