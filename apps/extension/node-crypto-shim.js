// Build-time shim: the engine's id.ts imports `randomUUID` from `node:crypto`,
// which does not exist in a browser/MV3 service-worker context. The Web Crypto
// API provides an identical `crypto.randomUUID()` globally there (Chrome 92+),
// so this maps the one symbol the engine uses onto it. Aliased in
// build-extension.mjs; never touches the engine source (which stays portable
// and node-testable).
export function randomUUID() {
  return globalThis.crypto.randomUUID();
}
