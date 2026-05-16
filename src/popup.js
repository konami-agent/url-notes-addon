import { createBrowserAdapter } from './browserApi.js';
import { createUrlNoteStore, normalizeUrlForNoteKey } from './urlNotes.js';

const DEFAULT_DEBOUNCE_MS = 250;

export async function initializePopup({
  document,
  adapter = createBrowserAdapter(),
  createStore = (storageArea) => createUrlNoteStore(storageArea),
  debounceMs = DEFAULT_DEBOUNCE_MS,
  setTimeout: schedule = globalThis.setTimeout.bind(globalThis),
  clearTimeout: cancelSchedule = globalThis.clearTimeout.bind(globalThis),
} = {}) {
  const urlKey = requiredElement(document, '#url-key');
  const note = requiredElement(document, '#note');
  const status = requiredElement(document, '#status');
  const store = createStore(adapter.storage.local);
  let activeUrl;
  let saveTimer;

  try {
    const activeTab = await adapter.getActiveTab();
    if (!activeTab?.url) throw new Error('Active tab has no URL.');

    activeUrl = activeTab.url;
    urlKey.textContent = normalizeUrlForNoteKey(activeUrl);
    note.value = await store.loadNote(activeUrl);
    status.textContent = 'Loaded.';
  } catch (error) {
    status.textContent = `Error: ${error.message}`;
    return;
  }

  note.addEventListener('input', () => {
    if (saveTimer) cancelSchedule(saveTimer);
    status.textContent = 'Saving…';
    saveTimer = schedule(async () => {
      try {
        await store.saveNote(activeUrl, note.value);
        status.textContent = note.value.trim() === '' ? 'Deleted.' : 'Saved.';
      } catch (error) {
        status.textContent = `Error: ${error.message}`;
      }
    }, debounceMs);
  });
}

function requiredElement(document, selector) {
  const element = document?.querySelector(selector);
  if (!element) throw new Error(`Missing popup element: ${selector}`);
  return element;
}

if (typeof document !== 'undefined') {
  initializePopup({ document }).catch((error) => {
    const status = document.querySelector('#status');
    if (status) status.textContent = `Error: ${error.message}`;
  });
}
