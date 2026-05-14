export function getBrowserApi(globalObject = globalThis) {
  if (globalObject.browser) return globalObject.browser;
  if (globalObject.chrome) return globalObject.chrome;
  throw new Error('No WebExtension browser API found');
}

export function createBrowserAdapter(globalObject = globalThis) {
  if (globalObject.browser) {
    const browser = globalObject.browser;
    return {
      storage: { local: browser.storage.local },
      getActiveTab: async () => firstActiveTab(await browser.tabs.query(activeTabQuery())),
    };
  }

  if (globalObject.chrome) {
    const chrome = globalObject.chrome;
    return {
      storage: {
        local: {
          get: (keys) => callChrome(chrome, chrome.storage.local.get, keys),
          set: (items) => callChrome(chrome, chrome.storage.local.set, items),
          remove: (keys) => callChrome(chrome, chrome.storage.local.remove, keys),
        },
      },
      getActiveTab: async () => firstActiveTab(await callChrome(chrome, chrome.tabs.query, activeTabQuery())),
    };
  }

  throw new Error('No WebExtension browser API found');
}

function activeTabQuery() {
  return { active: true, currentWindow: true };
}

function firstActiveTab(tabs) {
  return Array.isArray(tabs) ? tabs[0] : undefined;
}

function callChrome(chrome, method, argument) {
  return new Promise((resolve, reject) => {
    method(argument, (result) => {
      const lastError = chrome.runtime?.lastError;
      chrome.runtime.lastError = null;
      if (lastError) {
        reject(new Error(lastError.message ?? String(lastError)));
        return;
      }
      resolve(result);
    });
  });
}
