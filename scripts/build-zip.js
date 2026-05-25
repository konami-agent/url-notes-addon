import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename, join, relative, resolve, sep } from 'node:path';
import { validateExtension } from './validate-extension.js';

const includedRoots = ['manifest.json', 'popup', 'src', 'icons', 'LICENSE', 'README.md'];
const excludedNames = new Set(['.git', '.gitkeep', 'node_modules', 'dist']);

const crcTable = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimestamp(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = (year - 1980) << 9 | (date.getMonth() + 1) << 5 | date.getDate();
  return { time, day };
}

function localFileHeader(nameBuffer, content, crc, timestamp) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(timestamp.time, 10);
  header.writeUInt16LE(timestamp.day, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(content.length, 18);
  header.writeUInt32LE(content.length, 22);
  header.writeUInt16LE(nameBuffer.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, nameBuffer, content]);
}

function centralDirectoryHeader(nameBuffer, content, crc, offset, timestamp) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(timestamp.time, 12);
  header.writeUInt16LE(timestamp.day, 14);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(content.length, 20);
  header.writeUInt32LE(content.length, 24);
  header.writeUInt16LE(nameBuffer.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(offset, 42);
  return Buffer.concat([header, nameBuffer]);
}

function endOfCentralDirectory(entryCount, centralDirectorySize, centralDirectoryOffset) {
  const record = Buffer.alloc(22);
  record.writeUInt32LE(0x06054b50, 0);
  record.writeUInt16LE(0, 4);
  record.writeUInt16LE(0, 6);
  record.writeUInt16LE(entryCount, 8);
  record.writeUInt16LE(entryCount, 10);
  record.writeUInt32LE(centralDirectorySize, 12);
  record.writeUInt32LE(centralDirectoryOffset, 16);
  record.writeUInt16LE(0, 20);
  return record;
}

async function collectFiles(root, entry) {
  const absolute = resolve(root, entry);
  const listing = await readdir(absolute, { withFileTypes: true }).catch(async () => null);

  if (listing === null) return [entry];

  const files = [];
  for (const dirent of listing) {
    if (excludedNames.has(dirent.name)) continue;
    const child = join(entry, dirent.name);
    if (dirent.isDirectory()) {
      files.push(...await collectFiles(root, child));
    } else if (dirent.isFile()) {
      files.push(child);
    }
  }
  return files;
}

async function extensionFiles(root) {
  const files = [];
  for (const entry of includedRoots) {
    files.push(...await collectFiles(root, entry));
  }
  return files
    .map((file) => file.split(sep).join('/'))
    .sort();
}

export async function buildExtensionZip({
  projectRoot = new URL('..', import.meta.url),
  outputDir = 'dist',
} = {}) {
  const root = projectRoot instanceof URL ? fileURLToPath(projectRoot) : projectRoot;
  await validateExtension(root);
  const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const fileName = `${packageJson.name}-${packageJson.version}.zip`;
  const outDir = resolve(root, outputDir);
  const outputPath = resolve(outDir, fileName);
  const timestamp = dosTimestamp();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  const entries = await extensionFiles(root);
  for (const file of entries) {
    const archiveName = relative(root, resolve(root, file)).split(sep).join('/');
    const nameBuffer = Buffer.from(archiveName, 'utf8');
    const content = await readFile(resolve(root, file));
    const crc = crc32(content);
    const local = localFileHeader(nameBuffer, content, crc, timestamp);
    const central = centralDirectoryHeader(nameBuffer, content, crc, offset, timestamp);
    localParts.push(local);
    centralParts.push(central);
    offset += local.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const archive = Buffer.concat([
    ...localParts,
    centralDirectory,
    endOfCentralDirectory(centralParts.length, centralDirectory.length, offset),
  ]);

  await mkdir(outDir, { recursive: true });
  await writeFile(outputPath, archive);

  return { outputPath, fileName, entries };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildExtensionZip()
    .then((result) => {
      console.log(`Created ${result.outputPath} (${result.entries.length} files)`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
