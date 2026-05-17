const NOTE_KEY_PREFIX = 'urlNotes.notes.';
const DOMAIN_NOTE_KEY_PREFIX = 'urlNotes.domainNotes.';
const SCHEMA_VERSION = 1;

export function normalizeUrlForNoteKey(rawUrl, { ignoreQuery = false } = {}) {
  const url = new URL(rawUrl);
  url.hash = '';
  if (ignoreQuery) url.search = '';
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname !== '/' && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}

export function normalizeUrlForDomainNoteKey(rawUrl) {
  return new URL(rawUrl).hostname.toLowerCase();
}

export function createUrlNoteStore(storageArea, keyOptions = {}) {
  return {
    async loadNote(rawUrl) {
      const storageKey = noteStorageKey(rawUrl, keyOptions);
      const result = await storageArea.get(storageKey);
      return result[storageKey] ?? '';
    },

    async saveNote(rawUrl, noteText) {
      const storageKey = noteStorageKey(rawUrl, keyOptions);
      const normalizedNote = String(noteText ?? '').trim();
      if (normalizedNote === '') {
        await storageArea.remove(storageKey);
        return;
      }
      await storageArea.set({ [storageKey]: String(noteText) });
    },

    async clearNote(rawUrl) {
      await storageArea.remove(noteStorageKey(rawUrl, keyOptions));
    },

    async exportNotes() {
      const allItems = await storageArea.get(null);
      const notes = {};
      for (const [key, value] of Object.entries(allItems)) {
        if (key.startsWith(NOTE_KEY_PREFIX) && typeof value === 'string') {
          notes[key.slice(NOTE_KEY_PREFIX.length)] = value;
        }
      }
      return { schemaVersion: SCHEMA_VERSION, notes };
    },

    async listNotes() {
      const allItems = await storageArea.get(null);
      return Object.entries(allItems)
        .filter(([key, value]) => key.startsWith(NOTE_KEY_PREFIX) && typeof value === 'string')
        .map(([key, noteText]) => ({ url: key.slice(NOTE_KEY_PREFIX.length), noteText }))
        .sort((left, right) => left.url.localeCompare(right.url));
    },

    async importNotes(payload) {
      if (!payload || payload.schemaVersion !== SCHEMA_VERSION || typeof payload.notes !== 'object' || payload.notes === null) {
        throw new Error('Unsupported URL notes export format');
      }

      const notesToImport = [];
      try {
        for (const [rawUrl, noteText] of Object.entries(payload.notes)) {
          if (String(noteText ?? '').trim() === '') continue;
          notesToImport.push([normalizeUrlForNoteKey(rawUrl, keyOptions), String(noteText)]);
        }
      } catch {
        throw new Error('Unsupported URL notes export format');
      }

      for (const [normalizedUrl, noteText] of notesToImport) {
        await this.saveNote(normalizedUrl, noteText);
      }
      return notesToImport.length;
    },
  };
}

export function createDomainNoteStore(storageArea) {
  return {
    async loadNote(rawUrl) {
      const storageKey = domainNoteStorageKey(rawUrl);
      const result = await storageArea.get(storageKey);
      return result[storageKey] ?? '';
    },

    async saveNote(rawUrl, noteText) {
      const storageKey = domainNoteStorageKey(rawUrl);
      if (String(noteText ?? '').trim() === '') {
        await storageArea.remove(storageKey);
        return;
      }
      await storageArea.set({ [storageKey]: String(noteText) });
    },
  };
}

function noteStorageKey(rawUrl, keyOptions) {
  return `${NOTE_KEY_PREFIX}${normalizeUrlForNoteKey(rawUrl, keyOptions)}`;
}

function domainNoteStorageKey(rawUrl) {
  return `${DOMAIN_NOTE_KEY_PREFIX}${normalizeUrlForDomainNoteKey(rawUrl)}`;
}
