import { access, readFile, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve, sep } from 'node:path';

const requiredFiles = [
  'popup/popup.html',
  'popup/popup.css',
  'src/browserApi.js',
  'src/urlNotes.js',
  'src/popup.js',
  'src/markdownPreview.js',
  'icons/icon.svg',
];
const requiredReleaseFiles = ['LICENSE', 'README.md'];

const packagedCodeRoots = ['manifest.json', 'popup', 'src', 'icons'];
const packagedCodeExtensions = new Set(['.css', '.html', '.js', '.json', '.svg']);
const ignoredPackagedNames = new Set(['.git', '.gitkeep', 'node_modules', 'dist']);
const allowedPermissions = new Set(['activeTab', 'storage']);
const requiredScripts = {
  test: 'node --test',
  lint: 'node scripts/lint.js',
  'validate:extension': 'node scripts/validate-extension.js',
  'build:zip': 'node scripts/build-zip.js',
  'build:release': 'node scripts/build-release.js',
};
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
  'sandbox',
  'omnibox',
  'declarative_net_request',
  'browser_action',
  'page_action',
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
    if (ignoredPackagedNames.has(dirent.name)) continue;
    const child = join(entry, dirent.name);
    if (dirent.isDirectory()) {
      files.push(...await collectPackagedCodeFiles(root, child));
    } else if (dirent.isFile() && hasPackagedCodeExtension(child)) {
      files.push(child.split(sep).join('/'));
    } else if (dirent.isFile()) {
      throw new Error(`unsupported packaged file type: ${child.split(sep).join('/')}`);
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

  try {
    await access(resolve(root, 'manifest.json'), constants.R_OK);
  } catch {
    throw new Error('release package must include a readable manifest.json metadata file');
  }

  try {
    await Promise.all(requiredFiles.map((file) => access(resolve(root, file), constants.R_OK)));
  } catch {
    throw new Error('release package must include required extension files');
  }
  try {
    await Promise.all(requiredReleaseFiles.map((file) => access(resolve(root, file), constants.R_OK)));
  } catch {
    throw new Error('release package must include readable LICENSE and README.md files');
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
  } catch {
    throw new Error('release package must include a parseable manifest.json metadata file');
  }
  try {
    await access(resolve(root, 'package.json'), constants.R_OK);
  } catch {
    throw new Error('release package must include a readable package.json metadata file');
  }
  let packageJson;
  try {
    packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  } catch {
    throw new Error('release package must include a parseable package.json metadata file');
  }
  if (packageJson.name !== 'url-notes-addon' || packageJson.private !== true || packageJson.type !== 'module') {
    throw new Error('package.json metadata must keep name url-notes-addon, private true, and type module');
  }
  if (typeof packageJson.description !== 'string' || packageJson.description.trim() === '' || packageJson.license !== 'MIT') {
    throw new Error('package.json metadata must include a description and MIT license');
  }
  if (
    packageJson.repository?.type !== 'git'
    || packageJson.repository?.url !== 'git+https://github.com/konami-agent/url-notes-addon.git'
  ) {
    throw new Error('package.json repository must point to konami-agent/url-notes-addon');
  }
  if (
    typeof packageJson.scripts !== 'object'
    || packageJson.scripts === null
    || Object.entries(requiredScripts).some(([name, command]) => packageJson.scripts[name] !== command)
  ) {
    throw new Error('package.json scripts must include the expected local verification and release commands');
  }
  if (packageJson.engines?.node !== '>=20') {
    throw new Error('package.json engines.node must require Node.js >=20');
  }
  if (!/^\d+\.\d+\.\d+$/u.test(packageJson.version) || !/^\d+\.\d+\.\d+$/u.test(manifest.version)) {
    throw new Error('release version must use numeric major.minor.patch format');
  }
  if (packageJson.version !== manifest.version) {
    throw new Error('package.json version must match manifest version');
  }
  if (manifest.manifest_version !== 3) {
    throw new Error('manifest_version must be 3');
  }
  if (
    manifest.name !== 'URL Notes'
    || typeof manifest.description !== 'string'
    || manifest.description.trim() === ''
    || manifest.action?.default_title !== 'URL Notes'
  ) {
    throw new Error('manifest identity metadata must include URL Notes name, description, and action title');
  }
  if (manifest.action?.default_popup !== 'popup/popup.html') {
    throw new Error('manifest action.default_popup must be popup/popup.html');
  }
  for (const size of ['48', '128']) {
    const iconPath = manifest.icons?.[size];
    if (typeof iconPath !== 'string' || iconPath.trim() === '') {
      throw new Error('manifest icons must include readable 48 and 128 icon files');
    }
    if (!/^icons\/[\w.-]+\.svg$/u.test(iconPath)) {
      throw new Error('manifest icons must point to packaged SVG icon assets under icons/');
    }
    try {
      await access(resolve(root, iconPath), constants.R_OK);
    } catch {
      throw new Error('manifest icons must include readable 48 and 128 icon files');
    }
  }
  for (const size of ['16', '32', '48', '128']) {
    const iconPath = manifest.action?.default_icon?.[size];
    if (typeof iconPath !== 'string' || !/^icons\/[\w.-]+\.svg$/u.test(iconPath)) {
      throw new Error('manifest action default_icon must include packaged SVG icon assets for 16, 32, 48, and 128');
    }
    try {
      await access(resolve(root, iconPath), constants.R_OK);
    } catch {
      throw new Error('manifest action default_icon must include packaged SVG icon assets for 16, 32, 48, and 128');
    }
  }
  const permissionFields = [
    'permissions',
    'host_permissions',
    'optional_permissions',
    'optional_host_permissions',
  ];
  if (permissionFields.some((field) => manifest[field] !== undefined && !Array.isArray(manifest[field]))) {
    throw new Error('manifest permission fields must be arrays');
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
  if (Array.isArray(manifest.optional_permissions) && manifest.optional_permissions.length > 0) {
    throw new Error('manifest optional_permissions must stay empty for local-only v0.1');
  }
  if (Array.isArray(manifest.optional_host_permissions) && manifest.optional_host_permissions.length > 0) {
    throw new Error('manifest optional_host_permissions must stay empty for local-only v0.1');
  }
  if (manifest.content_scripts !== undefined) {
    throw new Error('manifest content_scripts must stay absent for popup-only v0.1');
  }
  if (manifest.content_security_policy !== undefined) {
    throw new Error('manifest must not define a custom content_security_policy for local-only v0.1');
  }
  if (manifest.oauth2 !== undefined) {
    throw new Error('manifest must not define oauth2 for local-only no-login v0.1');
  }
  if (manifest.incognito !== undefined) {
    throw new Error('manifest must not define incognito for local-only privacy boundary v0.1');
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
  return /[a-z][a-z0-9+.-]*:\/\/(?!\$\{|www\.w3\.org\/2000\/svg\b)/iu.test(contents)
    || /(?:^|[^:])\/\/(?:[a-z0-9.-]+\.[a-z]{2,}|localhost|[a-z][a-z0-9-]*|\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-f:.]+\])(?:[/:?#)]|$)/iu.test(contents)
    || /\b(?:mailto|tel):[^\s"'<>]+/iu.test(contents);
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
