const FLOATING_NOTE_SCRIPT = 'src/floatingNoteContent.js';

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
      openFloatingNote: async (tab) => {
        if (typeof browser.scripting?.executeScript !== 'function') {
          throw new Error('Floating note injection requires the scripting API');
        }
        await browser.scripting.executeScript(floatingNoteInjectionDetails(tab));
      },
    };
  }

  if (globalObject.chrome) {
    const chrome = globalObject.chrome;
    const storageLocal = chrome.storage.local;
    return {
      storage: {
        local: {
          get: (keys) => callChrome(chrome, storageLocal, storageLocal.get, keys),
          set: (items) => callChrome(chrome, storageLocal, storageLocal.set, items),
          remove: (keys) => callChrome(chrome, storageLocal, storageLocal.remove, keys),
        },
      },
      getActiveTab: async () => firstActiveTab(await callChrome(chrome, chrome.tabs, chrome.tabs.query, activeTabQuery())),
      openFloatingNote: async (tab) => {
        if (typeof chrome.scripting?.executeScript !== 'function') {
          throw new Error('Floating note injection requires the scripting API');
        }
        await callChrome(chrome, chrome.scripting, chrome.scripting.executeScript, floatingNoteInjectionDetails(tab));
      },
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

function floatingNoteInjectionDetails(tab) {
  const tabId = tab?.id;
  if (!Number.isInteger(tabId)) throw new Error('Floating note requires an active tab id');
  return {
    target: { tabId },
    files: [FLOATING_NOTE_SCRIPT],
  };
}

function callChrome(chrome, owner, method, argument) {
  return new Promise((resolve, reject) => {
    method.call(owner, argument, (result) => {
      const lastError = chrome.runtime?.lastError;
      if (lastError) {
        reject(new Error(lastError.message ?? String(lastError)));
        return;
      }
      resolve(result);
    });
  });
}
