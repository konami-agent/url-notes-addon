import { createBrowserAdapter } from './browserApi.js';
import { renderMarkdownPreview } from './markdownPreview.js';
import {
  createDomainNoteStore,
  createUrlNoteStore,
  normalizeUrlForDomainNoteKey,
  normalizeUrlForNoteKey,
} from './urlNotes.js';

const DEFAULT_DEBOUNCE_MS = 250;
const IGNORE_QUERY_SETTING_KEY = 'urlNotes.settings.ignoreQuery';

export async function initializePopup({
  document,
  adapter = createBrowserAdapter(),
  createStore = (storageArea) => createUrlNoteStore(storageArea),
  createDomainStore = (storageArea) => createDomainNoteStore(storageArea),
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
  const ignoreQuery = requiredElement(document, '#ignore-query');
  const domainKey = requiredElement(document, '#domain-key');
  const domainNote = requiredElement(document, '#domain-note');
  const notePreview = requiredElement(document, '#note-preview');
  const domainPreview = requiredElement(document, '#domain-preview');
  let keyOptions = { ignoreQuery: false };
  let store;
  let domainStore;
  let activeUrl;
  let activeDomainAvailable = false;
  let saveTimer;
  let domainSaveTimer;
  let listedNotes = [];

  const renderNotes = () => renderNoteOverview({ document, notesList, notesEmpty, notes: listedNotes, query: notesSearch.value });
  const renderCurrentPreviews = () => {
    renderMarkdownPreview({ document, container: notePreview, markdown: note.value });
    renderMarkdownPreview({ document, container: domainPreview, markdown: activeDomainAvailable ? domainNote.value : '' });
  };

  async function reloadCurrentNote(message) {
    urlKey.textContent = normalizeUrlForNoteKey(activeUrl, keyOptions);
    activeDomainAvailable = updateDomainNoteAvailability(activeUrl, { domainKey, domainNote });
    note.value = await store.loadNote(activeUrl);
    domainNote.value = activeDomainAvailable ? await domainStore.loadNote(activeUrl) : '';
    renderCurrentPreviews();
    listedNotes = await listOverviewEntries(store, domainStore);
    renderNotes();
    status.textContent = message;
  }

  try {
    const activeTab = await adapter.getActiveTab();
    if (!activeTab?.url) throw new Error('Active tab has no URL.');

    const settings = await adapter.storage.local.get(IGNORE_QUERY_SETTING_KEY);
    keyOptions = { ignoreQuery: settings[IGNORE_QUERY_SETTING_KEY] === true };
    store = createStore(adapter.storage.local, keyOptions);
    domainStore = createDomainStore(adapter.storage.local);
    ignoreQuery.checked = keyOptions.ignoreQuery;
    activeUrl = activeTab.url;
    await reloadCurrentNote('Loaded.');
  } catch (error) {
    disableUnavailablePopupControls({
      urlKey,
      note,
      domainKey,
      domainNote,
      ignoreQuery,
      exportButton,
      importInput,
      notesSearch,
    });
    status.textContent = `Error: ${error.message}`;
    return;
  }

  note.addEventListener('input', () => {
    if (saveTimer) cancelSchedule(saveTimer);
    status.textContent = 'Saving…';
    renderCurrentPreviews();
    saveTimer = schedule(async () => {
      try {
        await store.saveNote(activeUrl, note.value);
        renderCurrentPreviews();
        listedNotes = await listOverviewEntries(store, domainStore);
        renderNotes();
        status.textContent = note.value.trim() === '' ? 'Deleted.' : 'Saved.';
      } catch (error) {
        status.textContent = `Error: ${error.message}`;
      }
    }, debounceMs);
  });

  domainNote.addEventListener('input', () => {
    if (!activeDomainAvailable) {
      status.textContent = 'Domain notes are unavailable for this URL.';
      return;
    }
    if (domainSaveTimer) cancelSchedule(domainSaveTimer);
    status.textContent = 'Saving domain note…';
    renderCurrentPreviews();
    domainSaveTimer = schedule(async () => {
      try {
        await domainStore.saveNote(activeUrl, domainNote.value);
        renderCurrentPreviews();
        listedNotes = await listOverviewEntries(store, domainStore);
        renderNotes();
        status.textContent = domainNote.value.trim() === '' ? 'Domain note deleted.' : 'Domain note saved.';
      } catch (error) {
        status.textContent = `Error: ${error.message}`;
      }
    }, debounceMs);
  });

  exportButton.addEventListener('click', async () => {
    try {
      const urlPayload = await store.exportNotes();
      const domainPayload = await domainStore.exportNotes();
      const payload = { ...urlPayload, domainNotes: domainPayload.domainNotes };
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
      if (typeof domainStore.validateImport === 'function') domainStore.validateImport(payload);
      if (typeof store.validateImport === 'function') store.validateImport(payload);
      const importedDomainCount = await domainStore.importNotes(payload);
      const importedUrlCount = await store.importNotes(payload);
      note.value = await store.loadNote(activeUrl);
      domainNote.value = activeDomainAvailable ? await domainStore.loadNote(activeUrl) : '';
      renderCurrentPreviews();
      listedNotes = await listOverviewEntries(store, domainStore);
      renderNotes();
      status.textContent = `Imported ${importedUrlCount + importedDomainCount} notes.`;
    } catch (error) {
      status.textContent = `Error: ${error.message}`;
    } finally {
      event.target.value = '';
    }
  });

  notesSearch.addEventListener('input', renderNotes);

  ignoreQuery.addEventListener('change', async () => {
    try {
      keyOptions = { ignoreQuery: ignoreQuery.checked === true };
      await adapter.storage.local.set({ [IGNORE_QUERY_SETTING_KEY]: keyOptions.ignoreQuery });
      store = createStore(adapter.storage.local, keyOptions);
      await reloadCurrentNote(keyOptions.ignoreQuery ? 'Loaded with query strings ignored.' : 'Loaded with query strings preserved.');
    } catch (error) {
      status.textContent = `Error: ${error.message}`;
    }
  });
}

function renderNoteOverview({ document, notesList, notesEmpty, notes, query }) {
  const normalizedQuery = String(query ?? '').trim().toLowerCase();
  const matchingNotes = notes.filter(({ key, noteText }) => {
    if (normalizedQuery === '') return true;
    return key.toLowerCase().includes(normalizedQuery) || noteText.toLowerCase().includes(normalizedQuery);
  });

  notesList.replaceChildren(...matchingNotes.map(({ type, key, href, noteText }) => {
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = type === 'domain' ? 'Domain note' : 'URL note';
    label.setAttribute('class', 'note-kind');
    const link = document.createElement('a');
    link.textContent = key;
    if (isSafeOverviewHref(href)) {
      link.setAttribute('href', href);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
    const preview = document.createElement('p');
    preview.textContent = noteText;
    item.append(label, link, preview);
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

async function listOverviewEntries(store, domainStore) {
  const urlNotes = await store.listNotes();
  const domainNotes = typeof domainStore.listNotes === 'function' ? await domainStore.listNotes() : [];
  return [
    ...urlNotes.map(({ url, noteText }) => ({ type: 'url', key: url, href: url, noteText })),
    ...domainNotes.map(({ domain, noteText }) => ({
      type: 'domain',
      key: domain,
      href: isValidDomainOverviewKey(domain) ? `https://${domain}/` : undefined,
      noteText,
    })),
  ];
}

function updateDomainNoteAvailability(activeUrl, { domainKey, domainNote }) {
  try {
    domainKey.textContent = normalizeUrlForDomainNoteKey(activeUrl);
    domainNote.disabled = false;
    return true;
  } catch {
    domainKey.textContent = 'Domain notes unavailable for this URL.';
    domainNote.value = '';
    domainNote.disabled = true;
    return false;
  }
}

function isSafeOverviewHref(href) {
  try {
    const url = new URL(href);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

function isValidDomainOverviewKey(domain) {
  const normalizedDomain = String(domain ?? '').trim();
  if (normalizedDomain === '' || /[\s/?#@:]/u.test(normalizedDomain)) return false;
  const labels = normalizedDomain.split('.');
  if (!labels.every((label) => (
    label !== ''
    && /^[a-z0-9-]+$/iu.test(label)
    && !label.startsWith('-')
    && !label.endsWith('-')
  ))) return false;
  try {
    return new URL(`https://${normalizedDomain}`).hostname.toLowerCase() === normalizedDomain.toLowerCase();
  } catch {
    return false;
  }
}

function disableUnavailablePopupControls({ urlKey, note, domainKey, domainNote, ignoreQuery, exportButton, importInput, notesSearch }) {
  urlKey.textContent = 'URL notes unavailable for this tab.';
  domainKey.textContent = 'Domain notes unavailable for this URL.';
  note.disabled = true;
  domainNote.disabled = true;
  ignoreQuery.disabled = true;
  exportButton.disabled = true;
  importInput.disabled = true;
  notesSearch.disabled = true;
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
