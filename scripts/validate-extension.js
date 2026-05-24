import { access, readFile, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve, sep } from 'node:path';

const requiredFiles = [
  'manifest.json',
  'popup/popup.html',
  'popup/popup.css',
  'src/browserApi.js',
  'src/urlNotes.js',
  'src/popup.js',
  'src/markdownPreview.js',
  'icons/icon.svg',
];

const packagedCodeRoots = ['manifest.json', 'popup', 'src', 'icons'];
const packagedCodeExtensions = new Set(['.css', '.html', '.js', '.json', '.svg']);
const allowedPermissions = new Set(['activeTab', 'storage']);
const nonPopupManifestEntryKeys = [
  'background',
  'options_ui',
  'options_page',
  'sidebar_action',
  'side_panel',
  'devtools_page',
  'chrome_url_overrides',
  'commands',
  'externally_connectable',
  'web_accessible_resources',
];

function hasPackagedCodeExtension(file) {
  return [...packagedCodeExtensions].some((extension) => file.endsWith(extension));
}

async function collectPackagedCodeFiles(root, entry) {
  const absolute = resolve(root, entry);
  const listing = await readdir(absolute, { withFileTypes: true }).catch(async () => null);

  if (listing === null) {
    return hasPackagedCodeExtension(entry) ? [entry] : [];
  }

  const files = [];
  for (const dirent of listing) {
    const child = join(entry, dirent.name);
    if (dirent.isDirectory()) {
      files.push(...await collectPackagedCodeFiles(root, child));
    } else if (dirent.isFile() && hasPackagedCodeExtension(child)) {
      files.push(child.split(sep).join('/'));
    }
  }
  return files;
}

async function packagedCodeFiles(root) {
  const files = [];
  for (const entry of packagedCodeRoots) {
    files.push(...await collectPackagedCodeFiles(root, entry));
  }
  return files.sort();
}

export async function validateExtension(projectRoot = new URL('..', import.meta.url)) {
  const root = projectRoot instanceof URL ? fileURLToPath(projectRoot) : projectRoot;

  for (const file of requiredFiles) {
    await access(resolve(root, file), constants.R_OK);
  }

  const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
  const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  if (packageJson.version !== manifest.version) {
    throw new Error('package.json version must match manifest version');
  }
  if (manifest.manifest_version !== 3) {
    throw new Error('manifest_version must be 3');
  }
  if (manifest.action?.default_popup !== 'popup/popup.html') {
    throw new Error('manifest action.default_popup must be popup/popup.html');
  }
  if (!manifest.permissions?.includes('storage')) {
    throw new Error('manifest permissions must include storage');
  }
  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  if (permissions.some((permission) => !allowedPermissions.has(permission))) {
    throw new Error('manifest permissions must stay limited to storage and activeTab');
  }
  if (!permissions.includes('activeTab')) {
    throw new Error('manifest permissions must include activeTab');
  }
  if (Array.isArray(manifest.host_permissions) && manifest.host_permissions.length > 0) {
    throw new Error('manifest host_permissions must stay empty for local-only v0.1');
  }
  if (Array.isArray(manifest.content_scripts) && manifest.content_scripts.length > 0) {
    throw new Error('manifest content_scripts must stay empty for popup-only v0.1');
  }
  if (manifest.content_security_policy !== undefined) {
    throw new Error('manifest must not define a custom content_security_policy for local-only v0.1');
  }
  for (const key of nonPopupManifestEntryKeys) {
    if (manifest[key] !== undefined) {
      throw new Error('manifest must remain popup-only for v0.1');
    }
  }

  const popupHtml = await readFile(resolve(root, 'popup/popup.html'), 'utf8');
  if (!popupHtml.includes('<script type="module" src="../src/popup.js"></script>')) {
    throw new Error('popup must load ../src/popup.js as its module script');
  }

  const checkedFiles = await packagedCodeFiles(root);
  for (const file of checkedFiles) {
    const contents = await readFile(resolve(root, file), 'utf8');
    if (hasRemoteUrl(contents)) {
      throw new Error(`remote URL found in packaged extension file: ${file}`);
    }
    if (file.endsWith('.html') && /<[^>]+\son[a-z][\w:-]*\s*=/iu.test(contents)) {
      throw new Error(`inline event handler found in packaged HTML file: ${file}`);
    }
    if (file.endsWith('.html') && /<script\b(?![^>]*\bsrc\s*=)[^>]*>/iu.test(contents)) {
      throw new Error(`inline script block found in packaged HTML file: ${file}`);
    }
    if (file.endsWith('.html') && hasUnexpectedScriptSource(contents)) {
      throw new Error(`unexpected script source found in packaged HTML file: ${file}`);
    }
  }

  return {
    manifestVersion: manifest.manifest_version,
    defaultPopup: manifest.action.default_popup,
    checkedFiles,
  };
}

function hasRemoteUrl(contents) {
  return /(?:https?|wss?):\/\/(?!\$\{|www\.w3\.org\/2000\/svg\b)/iu.test(contents)
    || /(?:^|[^:])\/\/[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#)]|$)/iu.test(contents);
}

function hasUnexpectedScriptSource(html) {
  const scriptTagsWithSources = html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/giu);
  for (const match of scriptTagsWithSources) {
    const tag = match[0];
    const src = match[1] ?? match[2] ?? match[3] ?? '';
    if (src !== '../src/popup.js' || !/\btype\s*=\s*(?:"module"|'module'|module)(?:\s|>|\/)/iu.test(tag)) {
      return true;
    }
  }
  return false;
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
