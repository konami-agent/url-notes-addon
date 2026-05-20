const NOTE_KEY_PREFIX = 'urlNotes.notes.';
const DOMAIN_NOTE_KEY_PREFIX = 'urlNotes.domainNotes.';
const SCHEMA_VERSION = 1;

export function normalizeUrlForNoteKey(rawUrl, { ignoreQuery = false } = {}) {
  const url = new URL(rawUrl);
  if ((url.protocol === 'http:' || url.protocol === 'https:') && (url.username !== '' || url.password !== '')) {
    throw new Error('URL notes do not support credential-bearing URLs');
  }
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
  const hostname = new URL(rawUrl).hostname.toLowerCase();
  if (hostname === '') throw new Error('Domain notes require a URL host');
  return hostname;
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
          const url = key.slice(NOTE_KEY_PREFIX.length);
          if (isSafeStoredUrlKey(url)) notes[url] = value;
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

    validateImport(payload) {
      return collectUrlNotesForImport(payload, keyOptions);
    },

    async importNotes(payload) {
      const notesToImport = this.validateImport(payload);
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

    async exportNotes() {
      const allItems = await storageArea.get(null);
      const domainNotes = {};
      for (const [key, value] of Object.entries(allItems)) {
        if (key.startsWith(DOMAIN_NOTE_KEY_PREFIX) && typeof value === 'string') {
          const domain = key.slice(DOMAIN_NOTE_KEY_PREFIX.length);
          if (isValidDomainKeyShape(domain)) domainNotes[domain] = value;
        }
      }
      return { schemaVersion: SCHEMA_VERSION, domainNotes };
    },

    async listNotes() {
      const allItems = await storageArea.get(null);
      return Object.entries(allItems)
        .filter(([key, value]) => key.startsWith(DOMAIN_NOTE_KEY_PREFIX) && typeof value === 'string')
        .map(([key, noteText]) => ({ domain: key.slice(DOMAIN_NOTE_KEY_PREFIX.length), noteText }))
        .sort((left, right) => left.domain.localeCompare(right.domain));
    },

    validateImport(payload) {
      return collectDomainNotesForImport(payload);
    },

    async importNotes(payload) {
      const domainNotesToImport = this.validateImport(payload);
      for (const [domain, noteText] of domainNotesToImport) {
        await storageArea.set({ [`${DOMAIN_NOTE_KEY_PREFIX}${domain}`]: noteText });
      }
      return domainNotesToImport.length;
    },
  };
}

function noteStorageKey(rawUrl, keyOptions) {
  return `${NOTE_KEY_PREFIX}${normalizeUrlForNoteKey(rawUrl, keyOptions)}`;
}

function domainNoteStorageKey(rawUrl) {
  return `${DOMAIN_NOTE_KEY_PREFIX}${normalizeUrlForDomainNoteKey(rawUrl)}`;
}

function collectUrlNotesForImport(payload, keyOptions) {
  if (!payload || payload.schemaVersion !== SCHEMA_VERSION || typeof payload.notes !== 'object' || payload.notes === null) {
    throw new Error('Unsupported URL notes export format');
  }

  const notesToImport = [];
  try {
    for (const [rawUrl, noteText] of Object.entries(payload.notes)) {
      if (String(noteText ?? '').trim() === '') continue;
      const normalizedUrl = normalizeUrlForNoteKey(rawUrl, keyOptions);
      if (!isSafeWebUrl(normalizedUrl)) throw new Error('Invalid URL scheme');
      notesToImport.push([normalizedUrl, String(noteText)]);
    }
  } catch {
    throw new Error('Unsupported URL notes export format');
  }
  return notesToImport;
}

function isSafeWebUrl(rawUrl) {
  const url = new URL(rawUrl);
  return (url.protocol === 'http:' || url.protocol === 'https:') && url.username === '' && url.password === '';
}

function isSafeStoredUrlKey(rawUrl) {
  try {
    return isSafeWebUrl(rawUrl);
  } catch {
    return false;
  }
}

function collectDomainNotesForImport(payload) {
  if (!payload || payload.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('Unsupported URL notes export format');
  }
  if (payload.domainNotes == null) return [];
  if (typeof payload.domainNotes !== 'object') {
    throw new Error('Unsupported URL notes export format');
  }

  const domainNotesToImport = [];
  try {
    for (const [rawDomain, noteText] of Object.entries(payload.domainNotes)) {
      if (String(noteText ?? '').trim() === '') continue;
      domainNotesToImport.push([normalizeDomainForImport(rawDomain), String(noteText)]);
    }
  } catch {
    throw new Error('Unsupported URL notes export format');
  }
  return domainNotesToImport;
}

function normalizeDomainForImport(rawDomain) {
  const domain = String(rawDomain ?? '').trim();
  if (!isValidDomainKeyShape(domain)) throw new Error('Invalid domain');
  return new URL(`https://${domain}`).hostname.toLowerCase();
}

function isValidDomainKeyShape(domain) {
  if (domain === '' || /[\s/?#@:]/u.test(domain)) return false;
  const labels = domain.split('.');
  return labels.every((label) => (
    label !== ''
    && /^[a-z0-9-]+$/iu.test(label)
    && !label.startsWith('-')
    && !label.endsWith('-')
  ));
}
