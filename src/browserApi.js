export function getBrowserApi(globalObject = globalThis) {
  if (globalObject.browser) return globalObject.browser;
  if (globalObject.chrome) return globalObject.chrome;
  throw new Error('No WebExtension browser API found');
}
