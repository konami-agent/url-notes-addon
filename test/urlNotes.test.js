import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createUrlNoteStore,
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

test('URL note store saves and loads notes by normalized URL key', async () => {
  const store = createUrlNoteStore(new MemoryStorageArea());

  await store.saveNote('https://example.com/path#one', 'first note');

  assert.equal(await store.loadNote('https://EXAMPLE.com/path#two'), 'first note');
  assert.equal(await store.loadNote('https://example.com/path?query=1'), '');
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
