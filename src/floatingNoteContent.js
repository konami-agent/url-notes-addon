(() => {
  const ROOT_ID = 'url-notes-floating-root';
  const NOTE_KEY_PREFIX = 'urlNotes.notes.';

  function normalizeUrlForNoteKey(rawUrl) {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('URL notes support only HTTP and HTTPS URLs');
    }
    if (url.username !== '' || url.password !== '') {
      throw new Error('URL notes do not support credential-bearing URLs');
    }
    url.hash = '';
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname !== '/' && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  }

  function noteStorageKey(rawUrl) {
    return `${NOTE_KEY_PREFIX}${normalizeUrlForNoteKey(rawUrl)}`;
  }

  function getStorageApi() {
    if (globalThis.browser?.storage?.local) {
      return { area: globalThis.browser.storage.local, callbackApi: false, runtime: globalThis.browser.runtime };
    }
    if (globalThis.chrome?.storage?.local) {
      return { area: globalThis.chrome.storage.local, callbackApi: true, runtime: globalThis.chrome.runtime };
    }
    throw new Error('Floating note requires local extension storage');
  }

  function chromeLastError(storageApi) {
    return storageApi.runtime?.lastError;
  }

  function storageGet(storageApi, key) {
    if (storageApi.callbackApi) {
      return new Promise((resolve, reject) => {
        storageApi.area.get.call(storageApi.area, key, (result) => {
          const lastError = chromeLastError(storageApi);
          if (lastError) reject(new Error(lastError.message ?? String(lastError)));
          else resolve(result ?? {});
        });
      });
    }
    return storageApi.area.get(key);
  }

  function storageSet(storageApi, items) {
    if (storageApi.callbackApi) {
      return new Promise((resolve, reject) => {
        storageApi.area.set.call(storageApi.area, items, () => {
          const lastError = chromeLastError(storageApi);
          if (lastError) reject(new Error(lastError.message ?? String(lastError)));
          else resolve();
        });
      });
    }
    return storageApi.area.set(items);
  }

  function storageRemove(storageApi, key) {
    if (storageApi.callbackApi) {
      return new Promise((resolve, reject) => {
        storageApi.area.remove.call(storageApi.area, key, () => {
          const lastError = chromeLastError(storageApi);
          if (lastError) reject(new Error(lastError.message ?? String(lastError)));
          else resolve();
        });
      });
    }
    return storageApi.area.remove(key);
  }

  function makeElement(document, tagName, attributes = {}, textContent = '') {
    const element = document.createElement(tagName);
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, value);
    }
    if (textContent !== '') element.textContent = textContent;
    return element;
  }

  function installCleanup(document, root, keydownHandler) {
    const cleanup = () => {
      document.removeEventListener?.('keydown', keydownHandler);
      root.remove();
      if (globalThis.__urlNotesFloatingNoteCleanup === cleanup) {
        delete globalThis.__urlNotesFloatingNoteCleanup;
      }
    };
    globalThis.__urlNotesFloatingNoteCleanup = cleanup;
    return cleanup;
  }

  function buildPanel({ document, root, normalizedUrl, noteText, saveNote, cleanup }) {
    const shadow = typeof root.attachShadow === 'function' ? root.attachShadow({ mode: 'open' }) : root;
    const style = makeElement(document, 'style');
    style.textContent = `
      :host { all: initial; }
      .url-notes-floating-panel {
        position: fixed;
        top: 1rem;
        right: 1rem;
        z-index: 2147483647;
        width: min(24rem, calc(100vw - 2rem));
        box-sizing: border-box;
        padding: 0.75rem;
        border: 1px solid currentColor;
        border-radius: 0.5rem;
        background: Canvas;
        color: CanvasText;
        box-shadow: 0 0.5rem 2rem rgba(0, 0, 0, 0.25);
        font: 14px system-ui, sans-serif;
      }
      .url-notes-floating-header { display: flex; justify-content: space-between; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem; }
      .url-notes-floating-title { font-weight: 700; }
      .url-notes-floating-key { overflow-wrap: anywhere; opacity: 0.75; font-size: 0.75rem; margin: 0 0 0.5rem; }
      .url-notes-floating-textarea { box-sizing: border-box; width: 100%; min-height: 9rem; resize: vertical; font: inherit; }
      .url-notes-floating-status { min-height: 1.2em; margin: 0.4rem 0 0; font-size: 0.75rem; opacity: 0.8; }
    `;
    const panel = makeElement(document, 'section', {
      class: 'url-notes-floating-panel',
      role: 'dialog',
      'aria-label': 'URL floating note',
    });
    const header = makeElement(document, 'div', { class: 'url-notes-floating-header' });
    const title = makeElement(document, 'span', { class: 'url-notes-floating-title' }, 'URL Notes');
    const close = makeElement(document, 'button', { type: 'button', class: 'url-notes-floating-close' }, 'Close');
    const key = makeElement(document, 'p', { class: 'url-notes-floating-key' }, normalizedUrl);
    const textarea = makeElement(document, 'textarea', {
      class: 'url-notes-floating-textarea',
      'aria-label': 'Floating URL note',
      placeholder: 'Write a note for this URL',
    });
    textarea.value = noteText;
    const status = makeElement(document, 'p', { class: 'url-notes-floating-status', role: 'status' }, 'Loaded. Press Escape to close.');

    close.addEventListener('click', cleanup);
    textarea.addEventListener('input', async () => {
      status.textContent = 'Saving...';
      try {
        await saveNote(textarea.value);
        status.textContent = String(textarea.value ?? '').trim() === '' ? 'Deleted.' : 'Saved.';
      } catch (error) {
        status.textContent = `Error: ${error.message}`;
      }
    });

    header.append(title, close);
    panel.append(header, key, textarea, status);
    shadow.append(style, panel);
    return { panel, textarea, status };
  }

  async function toggleFloatingNote({ document = globalThis.document, location = globalThis.location, storageApi = getStorageApi() } = {}) {
    if (!document?.body) throw new Error('Floating note requires a document body');
    const existing = document.getElementById?.(ROOT_ID);
    if (existing) {
      if (typeof globalThis.__urlNotesFloatingNoteCleanup === 'function') globalThis.__urlNotesFloatingNoteCleanup();
      else existing.remove();
      return { action: 'closed' };
    }

    const normalizedUrl = normalizeUrlForNoteKey(location.href);
    const storageKey = noteStorageKey(location.href);
    const result = await storageGet(storageApi, storageKey);
    const root = makeElement(document, 'div', { id: ROOT_ID });
    let cleanup;
    const keydownHandler = (event) => {
      if (event.key === 'Escape') cleanup();
    };
    cleanup = installCleanup(document, root, keydownHandler);
    document.addEventListener?.('keydown', keydownHandler);
    buildPanel({
      document,
      root,
      normalizedUrl,
      noteText: result?.[storageKey] ?? '',
      cleanup,
      saveNote: async (noteText) => {
        if (String(noteText ?? '').trim() === '') await storageRemove(storageApi, storageKey);
        else await storageSet(storageApi, { [storageKey]: String(noteText) });
      },
    });
    document.body.append(root);
    return { action: 'opened', root, normalizedUrl, storageKey };
  }

  const harness = { normalizeUrlForNoteKey, toggleFloatingNote, ready: Promise.resolve(null) };
  globalThis.__urlNotesFloatingNote = harness;
  if (typeof document !== 'undefined' && typeof location !== 'undefined') {
    harness.ready = toggleFloatingNote().catch((error) => {
      globalThis.__urlNotesFloatingNoteError = error;
      throw error;
    });
  }
})();
