const NOTE_KEY_PREFIX = 'urlNotes.notes.';
const SCHEMA_VERSION = 1;

export function normalizeUrlForNoteKey(rawUrl) {
  const url = new URL(rawUrl);
  url.hash = '';
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname !== '/' && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}

export function createUrlNoteStore(storageArea) {
  return {
    async loadNote(rawUrl) {
      const storageKey = noteStorageKey(rawUrl);
      const result = await storageArea.get(storageKey);
      return result[storageKey] ?? '';
    },

    async saveNote(rawUrl, noteText) {
      const storageKey = noteStorageKey(rawUrl);
      const normalizedNote = String(noteText ?? '').trim();
      if (normalizedNote === '') {
        await storageArea.remove(storageKey);
        return;
      }
      await storageArea.set({ [storageKey]: String(noteText) });
    },

    async clearNote(rawUrl) {
      await storageArea.remove(noteStorageKey(rawUrl));
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

    async importNotes(payload) {
      if (!payload || payload.schemaVersion !== SCHEMA_VERSION || typeof payload.notes !== 'object' || payload.notes === null) {
        throw new Error('Unsupported URL notes export format');
      }

      const notesToImport = [];
      try {
        for (const [rawUrl, noteText] of Object.entries(payload.notes)) {
          if (String(noteText ?? '').trim() === '') continue;
          notesToImport.push([normalizeUrlForNoteKey(rawUrl), String(noteText)]);
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

function noteStorageKey(rawUrl) {
  return `${NOTE_KEY_PREFIX}${normalizeUrlForNoteKey(rawUrl)}`;
}
