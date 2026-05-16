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
  urlApi = globalThis.URL,
  BlobConstructor = globalThis.Blob,
} = {}) {
  const urlKey = requiredElement(document, '#url-key');
  const note = requiredElement(document, '#note');
  const status = requiredElement(document, '#status');
  const exportButton = requiredElement(document, '#export-notes');
  const importInput = requiredElement(document, '#import-notes');
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

  exportButton.addEventListener('click', async () => {
    try {
      const payload = await store.exportNotes();
      const blob = new BlobConstructor([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
      const objectUrl = urlApi.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.setAttribute('href', objectUrl);
      anchor.setAttribute('download', 'url-notes-export.json');
      anchor.click();
      urlApi.revokeObjectURL(objectUrl);
      status.textContent = 'Exported JSON.';
    } catch (error) {
      status.textContent = `Error: ${error.message}`;
    }
  });

  importInput.addEventListener('change', async (event) => {
    const [file] = Array.from(event.target.files ?? []);
    if (!file) return;

    try {
      const payload = JSON.parse(await file.text());
      const importedCount = await store.importNotes(payload);
      note.value = await store.loadNote(activeUrl);
      status.textContent = `Imported ${importedCount} notes.`;
    } catch (error) {
      status.textContent = `Error: ${error.message}`;
    }
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
