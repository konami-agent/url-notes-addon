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

class RejectingStorageArea extends MemoryStorageArea {
  constructor(rejectedKey) {
    super();
    this.rejectedKey = rejectedKey;
  }

  async set(items) {
    if (Object.hasOwn(items, this.rejectedKey)) {
      throw new Error(`storage write rejected for ${this.rejectedKey}`);
    }
    await super.set(items);
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

test('normalizeUrlForNoteKey rejects credential-bearing web URLs', () => {
  assert.throws(() => normalizeUrlForNoteKey('https://user@example.com/hidden'), /URL notes do not support credential-bearing URLs/);
  assert.throws(() => normalizeUrlForNoteKey('https://user:***@example.com/hidden'), /URL notes do not support credential-bearing URLs/);
});

test('normalizeUrlForNoteKey rejects non-web URL schemes', () => {
  assert.throws(() => normalizeUrlForNoteKey('about:blank'), /URL notes support only HTTP and HTTPS URLs/);
  assert.throws(() => normalizeUrlForNoteKey('file:///tmp/private.txt'), /URL notes support only HTTP and HTTPS URLs/);
  assert.throws(() => normalizeUrlForNoteKey('data:text/html,<h1>unsafe<\/h1>'), /URL notes support only HTTP and HTTPS URLs/);
});

test('normalizeUrlForDomainNoteKey extracts a lowercase host without URL path or query', () => {
  assert.equal(
    normalizeUrlForDomainNoteKey('HTTPS://Example.COM/path/?b=2&a=1#section'),
    'example.com',
  );
});

test('normalizeUrlForDomainNoteKey rejects URLs without a host', () => {
  assert.throws(() => normalizeUrlForDomainNoteKey('about:blank'), /Domain notes require a URL host/);
  assert.throws(() => normalizeUrlForDomainNoteKey('file:///tmp/example.txt'), /Domain notes require a URL host/);
});

test('normalizeUrlForDomainNoteKey rejects unsafe active URL schemes and credentials', () => {
  assert.throws(() => normalizeUrlForDomainNoteKey('ftp://example.com/private'), /Domain notes support only HTTP and HTTPS URLs/);
  assert.throws(() => normalizeUrlForDomainNoteKey('https://user@example.com/hidden'), /Domain notes do not support credential-bearing URLs/);
  assert.throws(() => normalizeUrlForDomainNoteKey('https://user:***@example.com/hidden'), /Domain notes do not support credential-bearing URLs/);
});

test('URL note store saves and loads notes by normalized URL key', async () => {
  const store = createUrlNoteStore(new MemoryStorageArea());

  await store.saveNote('https://example.com/path#one', 'first note');

  assert.equal(await store.loadNote('https://EXAMPLE.com/path#two'), 'first note');
  assert.equal(await store.loadNote('https://example.com/path?query=1'), '');
});

test('URL note store refuses to save credential-bearing active URL keys', async () => {
  const storage = new MemoryStorageArea();
  const store = createUrlNoteStore(storage);

  await assert.rejects(
    () => store.saveNote('https://user@example.com/hidden', 'credential note'),
    /URL notes do not support credential-bearing URLs/,
  );

  assert.deepEqual(storage.data, {});
  await store.saveNote('https://example.com/safe', 'safe note');
  assert.equal(await store.loadNote('https://example.com/safe'), 'safe note');
});

test('URL note store refuses to save non-web active URL keys', async () => {
  const storage = new MemoryStorageArea();
  const store = createUrlNoteStore(storage);

  await assert.rejects(
    () => store.saveNote('file:///tmp/private.txt', 'local path note'),
    /URL notes support only HTTP and HTTPS URLs/,
  );
  await assert.rejects(
    () => store.saveNote('about:blank', 'hostless note'),
    /URL notes support only HTTP and HTTPS URLs/,
  );

  assert.deepEqual(storage.data, {});
  await store.saveNote('http://example.org/safe', 'http note');
  await store.saveNote('https://example.com/safe', 'https note');
  assert.equal(await store.loadNote('http://example.org/safe'), 'http note');
  assert.equal(await store.loadNote('https://example.com/safe'), 'https note');
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

test('URL note store leaves no partial import entries when storage rejects a later key', async () => {
  const rejectedKey = 'urlNotes.notes.https://example.com/b';
  const storage = new RejectingStorageArea(rejectedKey);
  const store = createUrlNoteStore(storage);

  await assert.rejects(
    () => store.importNotes({
      schemaVersion: 1,
      notes: {
        'https://example.com/a': 'alpha',
        'https://example.com/b': 'bravo',
      },
    }),
    /storage write rejected/u,
  );

  assert.deepEqual(storage.data, {});
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

test('URL note store export skips stale invalid URL keys', async () => {
  const storage = new MemoryStorageArea({
    'urlNotes.notes.https://example.com/safe': 'safe note',
    'urlNotes.notes.http://example.org/page': 'http note',
    'urlNotes.notes.https://user@example.com/hidden': 'credential note',
    'urlNotes.notes.https://user:pass@example.com/hidden': 'password note',
    'urlNotes.notes.javascript:alert(1)': 'script note',
    'urlNotes.notes.data:text/html,<h1>unsafe</h1>': 'data note',
    'urlNotes.notes.not a url': 'malformed note',
  });
  const store = createUrlNoteStore(storage);

  assert.deepEqual(await store.exportNotes(), {
    schemaVersion: 1,
    notes: {
      'http://example.org/page': 'http note',
      'https://example.com/safe': 'safe note',
    },
  });
});

test('URL note store rejects credential-bearing import URL keys atomically', async () => {
  const storage = new MemoryStorageArea();
  const store = createUrlNoteStore(storage);

  await assert.rejects(
    () => store.importNotes({
      schemaVersion: 1,
      notes: {
        'https://example.com/safe': 'should not be saved',
        'https://user@example.com/hidden': 'credential note',
      },
    }),
    /Unsupported URL notes export format/,
  );

  await assert.rejects(
    () => store.importNotes({
      schemaVersion: 1,
      notes: {
        'https://user:pass@example.com/hidden': 'password note',
      },
    }),
    /Unsupported URL notes export format/,
  );

  assert.equal(await store.loadNote('https://example.com/safe'), '');
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

test('URL note store rejects unsafe non-web import URL schemes atomically', async () => {
  const storage = new MemoryStorageArea();
  const store = createUrlNoteStore(storage);

  await assert.rejects(
    () => store.importNotes({
      schemaVersion: 1,
      notes: {
        'https://example.com/safe': 'should not be saved',
        'javascript:alert(1)': 'unsafe script URL',
      },
    }),
    /Unsupported URL notes export format/,
  );

  await assert.rejects(
    () => store.importNotes({
      schemaVersion: 1,
      notes: {
        'data:text/html,<h1>unsafe</h1>': 'unsafe data URL',
      },
    }),
    /Unsupported URL notes export format/,
  );

  assert.equal(await store.loadNote('https://example.com/safe'), '');

  assert.equal(await store.importNotes({
    schemaVersion: 1,
    notes: {
      'http://example.org/path#section': 'http note',
      'https://example.net/path?x=1': 'https note',
    },
  }), 2);
  assert.equal(await store.loadNote('http://example.org/path'), 'http note');
  assert.equal(await store.loadNote('https://example.net/path?x=1'), 'https note');
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

test('domain note store rejects hostless URLs without using an empty domain key', async () => {
  const storage = new MemoryStorageArea();
  const domainStore = createDomainNoteStore(storage);

  await assert.rejects(() => domainStore.saveNote('about:blank', 'hostless note'), /Domain notes require a URL host/);
  await assert.rejects(() => domainStore.loadNote('file:///tmp/example.txt'), /Domain notes require a URL host/);

  assert.equal(storage.data['urlNotes.domainNotes.'], undefined);
});

test('domain note store refuses unsafe active URL keys without writing storage', async () => {
  const storage = new MemoryStorageArea();
  const domainStore = createDomainNoteStore(storage);

  await assert.rejects(
    () => domainStore.saveNote('ftp://example.com/private', 'ftp note'),
    /Domain notes support only HTTP and HTTPS URLs/,
  );
  await assert.rejects(
    () => domainStore.saveNote('https://user@example.com/hidden', 'credential note'),
    /Domain notes do not support credential-bearing URLs/,
  );

  assert.deepEqual(storage.data, {});
  await domainStore.saveNote('http://example.org/page', 'http domain note');
  await domainStore.saveNote('https://example.com/page', 'https domain note');
  assert.equal(await domainStore.loadNote('http://example.org/other'), 'http domain note');
  assert.equal(await domainStore.loadNote('https://example.com/other'), 'https domain note');
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

test('domain note store leaves no partial import entries when storage rejects a later key', async () => {
  const rejectedKey = 'urlNotes.domainNotes.example.net';
  const storage = new RejectingStorageArea(rejectedKey);
  const domainStore = createDomainNoteStore(storage);

  await assert.rejects(
    () => domainStore.importNotes({
      schemaVersion: 1,
      domainNotes: {
        'example.com': 'example note',
        'example.net': 'net note',
      },
    }),
    /storage write rejected/u,
  );

  assert.deepEqual(storage.data, {});
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

test('domain note store export skips malformed stale domain keys', async () => {
  const storage = new MemoryStorageArea({
    'urlNotes.domainNotes.example.com': 'valid note',
    'urlNotes.domainNotes.bad_domain.example': 'invalid underscore note',
    'urlNotes.domainNotes.user@example.org': 'invalid credential-like note',
    'urlNotes.domainNotes.example..net': 'invalid empty-label note',
  });
  const domainStore = createDomainNoteStore(storage);

  assert.deepEqual(await domainStore.exportNotes(), {
    schemaVersion: 1,
    domainNotes: {
      'example.com': 'valid note',
    },
  });
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

test('domain note store rejects URL-like import keys atomically', async () => {
  const storage = new MemoryStorageArea();
  const domainStore = createDomainNoteStore(storage);

  await assert.rejects(
    () => domainStore.importNotes({
      schemaVersion: 1,
      domainNotes: {
        'example.net': 'should not be saved',
        'example.com?tracking=1': 'query string should be rejected',
      },
    }),
    /Unsupported URL notes export format/,
  );

  await assert.rejects(
    () => domainStore.importNotes({
      schemaVersion: 1,
      domainNotes: {
        'user@example.org': 'credentials should be rejected',
      },
    }),
    /Unsupported URL notes export format/,
  );

  assert.equal(await domainStore.loadNote('https://example.net/anything'), '');
  assert.equal(await domainStore.loadNote('https://example.com/anything'), '');
  assert.equal(await domainStore.loadNote('https://example.org/anything'), '');
});

test('domain note store rejects malformed DNS-like import keys atomically', async () => {
  const storage = new MemoryStorageArea();
  const domainStore = createDomainNoteStore(storage);

  await assert.rejects(
    () => domainStore.importNotes({
      schemaVersion: 1,
      domainNotes: {
        'example.net': 'should not be saved',
        'example..com': 'empty label should be rejected',
      },
    }),
    /Unsupported URL notes export format/,
  );

  await assert.rejects(
    () => domainStore.importNotes({
      schemaVersion: 1,
      domainNotes: {
        '-bad.example': 'leading hyphen should be rejected',
        'bad-.example': 'trailing hyphen should be rejected',
      },
    }),
    /Unsupported URL notes export format/,
  );

  await assert.rejects(
    () => domainStore.importNotes({
      schemaVersion: 1,
      domainNotes: {
        'bad_domain.example': 'underscore should be rejected',
      },
    }),
    /Unsupported URL notes export format/,
  );

  assert.equal(await domainStore.loadNote('https://example.net/anything'), '');
  assert.equal(storage.data['urlNotes.domainNotes.example..com'], undefined);
  assert.equal(storage.data['urlNotes.domainNotes.-bad.example'], undefined);
  assert.equal(storage.data['urlNotes.domainNotes.bad-.example'], undefined);
  assert.equal(storage.data['urlNotes.domainNotes.bad_domain.example'], undefined);

  assert.equal(await domainStore.importNotes({
    schemaVersion: 1,
    domainNotes: { 'Example.COM': 'valid domain note' },
  }), 1);
  assert.equal(await domainStore.loadNote('https://example.com/page'), 'valid domain note');
});
