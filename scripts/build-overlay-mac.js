// Offline macOS bundle: use the installed Electron runtime, without packager.
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..'), desktop = path.join(root, 'desktop');
if (process.platform !== 'darwin') throw new Error('This build script targets macOS.');
const native = path.join(desktop, 'native');
const helperSource = path.join(native, 'activate-app.swift'), helper = path.join(native, 'activate-app');
if (!fs.existsSync(helper) || fs.statSync(helper).mtimeMs < fs.statSync(helperSource).mtimeMs) {
  execFileSync('/usr/bin/xcrun', ['swiftc', '-O', '-module-cache-path', path.join(require('os').tmpdir(), 'agent-overlay-swift-cache'),
    helperSource, '-o', helper], { stdio: 'inherit' });
}
const source = path.join(desktop, 'node_modules/electron/dist/Electron.app');
if (!fs.existsSync(source)) throw new Error('Run npm --prefix desktop install first.');
const output = path.join(root, 'dist-desktop', `Agent Overlay-darwin-${process.arch}`, 'Agent Overlay.app');
fs.mkdirSync(path.dirname(output), { recursive: true });
// This is a generated bundle, rebuilt from the runtime on every invocation.
fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(source, output, { recursive: true, force: true, verbatimSymlinks: true });
const contents = path.join(output, 'Contents'), resources = path.join(contents, 'Resources'), bundle = path.join(resources, 'app'), core = path.join(bundle, 'core');
fs.mkdirSync(core, { recursive: true });
for (const file of ['main.js', 'preload.js', 'package.json']) fs.copyFileSync(path.join(desktop, file), path.join(bundle, file));
fs.cpSync(native, path.join(bundle, 'native'), { recursive: true, force: true });
for (const file of ['server.js', 'codex.js', 'LICENSE']) fs.copyFileSync(path.join(root, file), path.join(core, file));
for (const dir of ['public', 'overlay']) fs.cpSync(path.join(root, dir), path.join(core, dir), { recursive: true, force: true });
fs.mkdirSync(path.join(core, 'media'), { recursive: true });
for (const file of ['tray.png', 'tray@2x.png']) fs.copyFileSync(path.join(root, 'media', file), path.join(core, 'media', file));
fs.copyFileSync(path.join(desktop, 'icon.icns'), path.join(resources, 'electron.icns'));
const plist = path.join(contents, 'Info.plist');
const set = (key, value) => execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist]);
set('CFBundleIdentifier', 'local.agentoverlay.desktop');
set('CFBundleName', 'Agent Overlay'); set('CFBundleDisplayName', 'Agent Overlay');
set('CFBundleVersion', JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'))).version);
set('CFBundleShortVersionString', JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'))).version);
execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Add :LSUIElement bool true', plist]);
execFileSync('codesign', ['--force', '--deep', '-s', '-', output], { stdio: 'inherit' });
console.log('Built ' + output);
