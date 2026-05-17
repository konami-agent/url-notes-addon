import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDomainNoteStore,
  createUrlNoteStore,
  normalizeUrlForDomainNoteKey,
  normalizeUrlForNoteKey,
} from '../src/urlNotes.js';

class MemoryStorageArea {
  constructor(initial = {}) {
    this.data = { ...initial };
  }

  async get(keys) {
    if (keys == null) return { ...this.data };
    if (typeof keys === 'string') {
      return Object.hasOwn(this.data, keys) ? { [keys]: this.data[keys] } : {};
    }
    if (Array.isArray(keys)) {
      return Object.fromEntries(keys.filter((key) => Object.hasOwn(this.data, key)).map((key) => [key, this.data[key]]));
    }
    return Object.fromEntries(Object.keys(keys).map((key) => [key, this.data[key] ?? keys[key]]));
  }

  async set(items) {
    Object.assign(this.data, items);
  }

  async remove(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      delete this.data[key];
    }
  }
}

test('normalizeUrlForNoteKey removes hash, preserves query, lowercases scheme and host, and trims safe trailing slash', () => {
  assert.equal(
    normalizeUrlForNoteKey('HTTPS://Example.COM/path/?b=2&a=1#section'),
    'https://example.com/path?b=2&a=1',
  );
});

test('normalizeUrlForNoteKey can ignore query strings when explicitly requested', () => {
  assert.equal(
    normalizeUrlForNoteKey('HTTPS://Example.COM/path/?b=2&a=1#section', { ignoreQuery: true }),
    'https://example.com/path',
  );
});

test('normalizeUrlForDomainNoteKey extracts a lowercase host without URL path or query', () => {
  assert.equal(
    normalizeUrlForDomainNoteKey('HTTPS://Example.COM/path/?b=2&a=1#section'),
    'example.com',
  );
});

test('URL note store saves and loads notes by normalized URL key', async () => {
  const store = createUrlNoteStore(new MemoryStorageArea());

  await store.saveNote('https://example.com/path#one', 'first note');

  assert.equal(await store.loadNote('https://EXAMPLE.com/path#two'), 'first note');
  assert.equal(await store.loadNote('https://example.com/path?query=1'), '');
});

test('URL note store can save and load notes with query strings ignored', async () => {
  const store = createUrlNoteStore(new MemoryStorageArea(), { ignoreQuery: true });

  await store.saveNote('https://example.com/path?utm_source=one#section', 'shared note');

  assert.equal(await store.loadNote('https://EXAMPLE.com/path?utm_source=two#other'), 'shared note');
  assert.deepEqual(await store.exportNotes(), {
    schemaVersion: 1,
    notes: { 'https://example.com/path': 'shared note' },
  });
});

test('URL note store deletes the note when saving blank text', async () => {
  const storage = new MemoryStorageArea();
  const store = createUrlNoteStore(storage);

  await store.saveNote('https://example.com/path', 'temporary');
  await store.saveNote('https://example.com/path', '   ');

  assert.equal(await store.loadNote('https://example.com/path'), '');
  assert.deepEqual(storage.data, {});
});

test('URL note store exports and imports schema-versioned notes', async () => {
  const source = createUrlNoteStore(new MemoryStorageArea());
  await source.saveNote('https://example.com/a#ignored', 'alpha');
  await source.saveNote('https://example.com/b?x=1', 'bravo');

  const exported = await source.exportNotes();

  assert.equal(exported.schemaVersion, 1);
  assert.deepEqual(exported.notes, {
    'https://example.com/a': 'alpha',
    'https://example.com/b?x=1': 'bravo',
  });

  const target = createUrlNoteStore(new MemoryStorageArea());
  const importedCount = await target.importNotes({
    schemaVersion: 1,
    notes: {
      'HTTPS://Example.com/a/#old': 'new alpha',
      'https://example.com/c': 'charlie',
      'https://example.com/blank': '',
    },
  });

  assert.equal(importedCount, 2);
  assert.equal(await target.loadNote('https://example.com/a'), 'new alpha');
  assert.equal(await target.loadNote('https://example.com/c#ignored'), 'charlie');
  assert.equal(await target.loadNote('https://example.com/blank'), '');
});

test('URL note store lists saved notes sorted by URL key', async () => {
  const storage = new MemoryStorageArea({
    'unrelated.setting': true,
    'urlNotes.notes.https://example.com/b': 'bravo',
    'urlNotes.notes.https://example.com/a': 'alpha',
    'urlNotes.notes.https://example.com/ignored': 42,
  });
  const store = createUrlNoteStore(storage);

  assert.deepEqual(await store.listNotes(), [
    { url: 'https://example.com/a', noteText: 'alpha' },
    { url: 'https://example.com/b', noteText: 'bravo' },
  ]);
});

test('URL note store rejects invalid imports without changing existing notes', async () => {
  const storage = new MemoryStorageArea();
  const store = createUrlNoteStore(storage);
  await store.saveNote('https://example.com/existing', 'keep me');

  await assert.rejects(
    () => store.importNotes({
      schemaVersion: 1,
      notes: {
        'https://example.com/new': 'should not be saved',
        'not a url': 'invalid',
      },
    }),
    /Unsupported URL notes export format/,
  );

  assert.equal(await store.loadNote('https://example.com/existing'), 'keep me');
  assert.equal(await store.loadNote('https://example.com/new'), '');
});

test('domain note store saves and deletes notes in a separate namespace from URL notes', async () => {
  const storage = new MemoryStorageArea();
  const urlStore = createUrlNoteStore(storage);
  const domainStore = createDomainNoteStore(storage);

  await urlStore.saveNote('https://example.com/path', 'page note');
  await domainStore.saveNote('HTTPS://Example.COM/other?x=1#section', 'domain note');

  assert.equal(await domainStore.loadNote('https://example.com/another'), 'domain note');
  assert.equal(await urlStore.loadNote('https://example.com/path'), 'page note');
  assert.deepEqual(await urlStore.exportNotes(), {
    schemaVersion: 1,
    notes: { 'https://example.com/path': 'page note' },
  });

  await domainStore.saveNote('https://example.com/anything', '  ');

  assert.equal(await domainStore.loadNote('https://example.com/path'), '');
  assert.equal(await urlStore.loadNote('https://example.com/path'), 'page note');
});

test('domain note store exports and imports schema-versioned domain notes', async () => {
  const source = createDomainNoteStore(new MemoryStorageArea());
  await source.saveNote('HTTPS://Example.COM/path?x=1#section', 'example domain note');
  await source.saveNote('https://example.org/other', 'org domain note');

  assert.deepEqual(await source.exportNotes(), {
    schemaVersion: 1,
    domainNotes: {
      'example.com': 'example domain note',
      'example.org': 'org domain note',
    },
  });

  const target = createDomainNoteStore(new MemoryStorageArea());
  const importedCount = await target.importNotes({
    schemaVersion: 1,
    domainNotes: {
      'Example.COM': 'new example note',
      'example.net': 'net note',
      'blank.example': '',
    },
  });

  assert.equal(importedCount, 2);
  assert.equal(await target.loadNote('https://example.com/page'), 'new example note');
  assert.equal(await target.loadNote('https://example.net/page'), 'net note');
  assert.equal(await target.loadNote('https://blank.example/page'), '');
});

test('domain note store lists saved domain notes sorted by domain key', async () => {
  const storage = new MemoryStorageArea({
    'urlNotes.notes.https://example.com/page': 'page note',
    'urlNotes.domainNotes.example.org': 'org domain note',
    'urlNotes.domainNotes.example.com': 'example domain note',
    'urlNotes.domainNotes.ignored.example': 42,
  });
  const domainStore = createDomainNoteStore(storage);

  assert.deepEqual(await domainStore.listNotes(), [
    { domain: 'example.com', noteText: 'example domain note' },
    { domain: 'example.org', noteText: 'org domain note' },
  ]);
});

test('domain note store accepts old exports without domain notes', async () => {
  const domainStore = createDomainNoteStore(new MemoryStorageArea());

  assert.equal(await domainStore.importNotes({ schemaVersion: 1, notes: { 'https://example.com': 'url note only' } }), 0);
});

test('domain note store rejects invalid imports without changing existing domain notes', async () => {
  const storage = new MemoryStorageArea();
  const domainStore = createDomainNoteStore(storage);
  await domainStore.saveNote('https://example.com/existing', 'keep me');

  await assert.rejects(
    () => domainStore.importNotes({
      schemaVersion: 1,
      domainNotes: {
        'example.net': 'should not be saved',
        'bad domain name': 'invalid',
      },
    }),
    /Unsupported URL notes export format/,
  );

  assert.equal(await domainStore.loadNote('https://example.com/anything'), 'keep me');
  assert.equal(await domainStore.loadNote('https://example.net/anything'), '');
});
