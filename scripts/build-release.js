import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { buildExtensionZip } from './build-zip.js';

export async function buildReleaseArtifacts({
  projectRoot = new URL('..', import.meta.url),
  outputDir = 'dist',
} = {}) {
  const zip = await buildExtensionZip({ projectRoot, outputDir });
  const archive = await readFile(zip.outputPath);
  const digest = createHash('sha256').update(archive).digest('hex');
  const checksumFileName = 'SHA256SUMS';
  const checksumPath = resolve(zip.outputPath, '..', checksumFileName);
  await writeFile(checksumPath, `${digest}  ${zip.fileName}\n`);

  return {
    zipPath: zip.outputPath,
    zipFileName: zip.fileName,
    checksumPath,
    checksumFileName: basename(checksumPath),
    entries: zip.entries,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildReleaseArtifacts()
    .then((result) => {
      console.log(`Created ${result.zipPath} and ${result.checksumPath}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
