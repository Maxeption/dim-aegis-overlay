import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'testing-build.local');
if (!fs.existsSync(configPath)) {
  throw new Error('Create testing-build.local with {"extensionDirectory":"/absolute/path/to/testing/extension"}.');
}
const { extensionDirectory } = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (typeof extensionDirectory !== 'string' || !path.isAbsolute(extensionDirectory)) {
  throw new Error('testing-build.local must specify an absolute extensionDirectory.');
}
const destination = path.resolve(extensionDirectory);
const dist = path.join(root, 'dist');
const within = (parent, child) => {
  const relative = path.relative(parent, child);
  return !relative || (!relative.startsWith('..') && !path.isAbsolute(relative));
};
if (within(root, destination) || within(destination, root)) {
  throw new Error('The installed testing directory must be separate from the source checkout.');
}
// Reject linked destinations before copying, so a local config cannot silently target another tree.
for (let directory = destination; ; directory = path.dirname(directory)) {
  if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) {
    throw new Error(`Testing destination contains a symbolic link: ${directory}`);
  }
  if (path.dirname(directory) === directory) break;
}

const git = (...args) => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-C', root, ...args], { encoding: 'utf8' }).trim();
const commit = git('rev-parse', 'HEAD');
const workingTreeChanges = git('status', '--porcelain');
const run = (file, args = []) => execFileSync(process.execPath, [file, ...args], { cwd: root, stdio: 'inherit' });
run(path.join(root, 'node_modules/typescript/bin/tsc'));
run(path.join(root, 'scripts/build.mjs'));

// This testing installation runs in Firefox/Zen. Retain its ID so reloads retain stored settings.
const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.firefox.json'), 'utf8'));
manifest.name = 'DIM Aegis Overlay (Testing Build)';
const installedManifest = path.join(destination, 'manifest.json');
if (fs.existsSync(installedManifest)) {
  const installed = JSON.parse(fs.readFileSync(installedManifest, 'utf8'));
  if (installed.browser_specific_settings?.gecko?.id !== manifest.browser_specific_settings.gecko.id) {
    throw new Error('Testing destination belongs to a different extension; refusing to overwrite it.');
  }
}

function files(directory, relative = '') {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symbolic link: ${path.join(directory, entry.name)}`);
    const name = path.join(relative, entry.name);
    return entry.isDirectory() ? files(path.join(directory, entry.name), name) : [name];
  });
}
const expected = new Map(files(dist).map(file => [file, fs.readFileSync(path.join(dist, file))]));
const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
expected.set('manifest.json', manifestBytes);
expected.set('manifest.firefox.json', manifestBytes);
const extras = files(destination).filter(file => !expected.has(file));
if (extras.length) throw new Error(`Remove obsolete testing files before syncing: ${extras.join(', ')}`);

for (const [file, bytes] of expected) {
  const target = path.join(destination, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
}
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hashes = {};
for (const [file, bytes] of expected) {
  const installed = fs.readFileSync(path.join(destination, file));
  if (!bytes.equals(installed)) throw new Error(`Testing build verification failed: ${file}`);
  hashes[file.replaceAll(path.sep, '/')] = hash(installed);
}
const metadata = {
  mode: 'Consolidated testing build',
  version: manifest.version,
  commit,
  workingTreeChanges,
  preparedAt: new Date().toISOString(),
  sourcePath: root,
  extensionPath: destination,
  extensionId: manifest.browser_specific_settings.gecko.id,
  reloadRequired: true,
  bundles: Object.fromEntries(Object.entries(hashes).filter(([file]) => file.endsWith('.js'))),
  files: hashes,
};
fs.writeFileSync(path.join(destination, '..', 'build-info.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log(`\nTesting build ready: ${installedManifest}`);
console.log(`Verified ${expected.size} files. Reload the extension, then refresh DIM.`);
