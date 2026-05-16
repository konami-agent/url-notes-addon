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
  const notesSearch = requiredElement(document, '#notes-search');
  const notesList = requiredElement(document, '#notes-list');
  const notesEmpty = requiredElement(document, '#notes-empty');
  const store = createStore(adapter.storage.local);
  let activeUrl;
  let saveTimer;
  let listedNotes = [];

  const renderNotes = () => renderNoteOverview({ document, notesList, notesEmpty, notes: listedNotes, query: notesSearch.value });

  try {
    const activeTab = await adapter.getActiveTab();
    if (!activeTab?.url) throw new Error('Active tab has no URL.');

    activeUrl = activeTab.url;
    urlKey.textContent = normalizeUrlForNoteKey(activeUrl);
    note.value = await store.loadNote(activeUrl);
    listedNotes = await store.listNotes();
    renderNotes();
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
        listedNotes = await store.listNotes();
        renderNotes();
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
      listedNotes = await store.listNotes();
      renderNotes();
      status.textContent = `Imported ${importedCount} notes.`;
    } catch (error) {
      status.textContent = `Error: ${error.message}`;
    }
  });

  notesSearch.addEventListener('input', renderNotes);
}

function renderNoteOverview({ document, notesList, notesEmpty, notes, query }) {
  const normalizedQuery = String(query ?? '').trim().toLowerCase();
  const matchingNotes = notes.filter(({ url, noteText }) => {
    if (normalizedQuery === '') return true;
    return url.toLowerCase().includes(normalizedQuery) || noteText.toLowerCase().includes(normalizedQuery);
  });

  notesList.replaceChildren(...matchingNotes.map(({ url, noteText }) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.textContent = url;
    link.setAttribute('href', url);
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    const preview = document.createElement('p');
    preview.textContent = noteText;
    item.append(link, preview);
    return item;
  }));

  if (matchingNotes.length > 0) {
    notesEmpty.textContent = '';
  } else if (notes.length === 0) {
    notesEmpty.textContent = 'No saved notes yet.';
  } else {
    notesEmpty.textContent = 'No matching notes.';
  }
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
