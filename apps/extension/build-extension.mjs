// Build the MV3 extension: bundle the TypeScript entry points to JavaScript
// Chrome can load, copy the static assets and the rule set, and emit a dist
// manifest pointing at the built .js files. Run via `npm run build:extension`.
//
// The extension is authored in .ts (the whole repo is); Chrome loads only .js,
// so this is the bundler A1.1 flagged as needed and deferred.

import { build } from 'esbuild';
import { mkdirSync, copyFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXT = dirname(fileURLToPath(import.meta.url));           // apps/extension
const REPO = join(EXT, '..', '..');
const DIST = join(EXT, 'dist');

if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const common = {
  bundle: true,
  platform: 'browser',
  target: 'chrome116',
  legalComments: 'none',
  // The engine's id.ts imports randomUUID from node:crypto, absent in the
  // browser. Web Crypto's crypto.randomUUID() is the drop-in there; alias the
  // one symbol rather than patch the (portable, node-tested) engine source.
  alias: { 'node:crypto': join(EXT, 'node-crypto-shim.js') },
};

// Service worker: ESM (manifest declares type: module).
await build({ ...common, entryPoints: [join(EXT, 'service-worker.ts')], outfile: join(DIST, 'service-worker.js'), format: 'esm' });
// Content script and popup: IIFE — content scripts and classic popup scripts
// are not ES modules.
await build({ ...common, entryPoints: [join(EXT, 'content-script.ts')], outfile: join(DIST, 'content-script.js'), format: 'iife' });
await build({ ...common, entryPoints: [join(EXT, 'popup.ts')], outfile: join(DIST, 'popup.js'), format: 'iife' });
// Tier-2 interstitial / block page (§9.4) — a real extension page the SW
// navigates the tab to, not an in-page overlay.
await build({ ...common, entryPoints: [join(EXT, 'intervention.ts')], outfile: join(DIST, 'intervention.js'), format: 'iife' });
// Full-tab dashboard (v3) — opened by the toolbar icon via chrome.action.onClicked.
await build({ ...common, entryPoints: [join(EXT, 'dashboard.ts')], outfile: join(DIST, 'dashboard.js'), format: 'iife' });

// Static assets + the rule set the engine loads at runtime.
copyFileSync(join(EXT, 'popup.html'), join(DIST, 'popup.html'));
copyFileSync(join(EXT, 'intervention.html'), join(DIST, 'intervention.html'));
copyFileSync(join(EXT, 'dashboard.html'), join(DIST, 'dashboard.html'));
copyFileSync(join(REPO, 'rulesets', 'rules-v0.1.0.json'), join(DIST, 'rules-v0.1.0.json'));

// The dist manifest — points at the BUILT .js, not the .ts sources.
const manifest = {
  manifest_version: 3,
  name: 'SecureSphere X',
  version: '0.1.0',
  description: 'Observes live login pages and produces structured evidence for deterministic phishing-risk evaluation. Analysis is local; no browsing data leaves the device.',
  minimum_chrome_version: '116',
  background: { service_worker: 'service-worker.js', type: 'module' },
  action: { default_title: 'SecureSphere X' },
  permissions: ['activeTab', 'scripting', 'storage', 'webNavigation', 'downloads'],
  host_permissions: [],
  content_scripts: [
    { matches: ['http://*/*', 'https://*/*'], js: ['content-script.js'], run_at: 'document_idle' },
  ],
};
writeFileSync(join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log('Built extension → apps/extension/dist/');
for (const f of ['manifest.json', 'service-worker.js', 'content-script.js', 'popup.js', 'popup.html', 'intervention.js', 'intervention.html', 'dashboard.js', 'dashboard.html', 'rules-v0.1.0.json']) {
  console.log(existsSync(join(DIST, f)) ? `  ✓ ${f}` : `  ✗ MISSING ${f}`);
}
