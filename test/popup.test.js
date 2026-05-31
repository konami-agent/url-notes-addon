import test from 'node:test';
import assert from 'node:assert/strict';

import { initializePopup } from '../src/popup.js';

class FakeElement {
  constructor({ value = '', textContent = '' } = {}) {
    this.value = value;
    this.textContent = textContent;
    this.checked = false;
    this.disabled = false;
    this.listeners = new Map();
    this.attributes = new Map();
    this.clicked = false;
    this.children = [];
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  click() {
    this.clicked = true;
  }

  append(...children) {
    this.children.push(...children);
    this.textContent += children.map((child) => child.textContent ?? '').join('');
  }

  replaceChildren(...children) {
    this.children = children;
    this.textContent = children.map((child) => child.textContent ?? '').join('');
  }

  dispatch(type, event = { target: this }) {
    const listener = this.listeners.get(type);
    assert.ok(listener, `expected ${type} listener to be registered`);
    return listener(event);
  }
}

function createPopupDocument() {
  const anchors = [];
  const elements = {
    '#url-key': new FakeElement(),
    '#note': new FakeElement(),
    '#status': new FakeElement(),
    '#export-notes': new FakeElement(),
    '#import-notes': new FakeElement(),
    '#import-notes-label': new FakeElement(),
    '#notes-search': new FakeElement(),
    '#notes-list': new FakeElement(),
    '#notes-empty': new FakeElement(),
    '#ignore-query': new FakeElement(),
    '#domain-key': new FakeElement(),
    '#domain-note': new FakeElement(),
    '#note-preview': new FakeElement(),
    '#domain-preview': new FakeElement(),
  };
  return {
    elements,
    anchors,
    querySelector(selector) {
      return elements[selector] ?? null;
    },
    createElement(tagName) {
      const element = new FakeElement();
      element.tagName = tagName;
      if (tagName === 'a') anchors.push(element);
      return element;
    },
  };
}

function createManualTimer() {
  let scheduled;
  return {
    setTimeout(callback, delay) {
      scheduled = { callback, delay, cancelled: false };
      return scheduled;
    },
    clearTimeout(handle) {
      handle.cancelled = true;
    },
    runPending() {
      assert.ok(scheduled, 'expected a pending debounce timer');
      assert.equal(scheduled.delay, 250);
      if (!scheduled.cancelled) return scheduled.callback();
      return undefined;
    },
  };
}

function createAdapter(url, initialStorage = {}) {
  const activeUrl = arguments.length === 0 ? 'https://example.com/page' : url;
  const storageData = { ...initialStorage };
  return {
    getActiveTab: async () => ({ url: activeUrl }),
    storage: {
      local: {
        data: storageData,
        async get(key) {
          if (key == null) return { ...storageData };
          return Object.hasOwn(storageData, key) ? { [key]: storageData[key] } : {};
        },
        async set(items) { Object.assign(storageData, items); },
      },
    },
  };
}

test('popup loads active tab note and displays normalized key', async () => {
  const document = createPopupDocument();
  const calls = [];
  const store = {
    async loadNote(url) {
      calls.push(['load', url]);
      return 'existing note';
    },
    async saveNote() {
      throw new Error('save should not run during initial load');
    },
    async exportNotes() { return { schemaVersion: 1, notes: {} }; },
    async importNotes() { return 0; },
    async listNotes() { return []; },
  };

  await initializePopup({
    document,
    adapter: createAdapter('HTTPS://Example.COM/path/#section'),
    createStore: () => store,
    debounceMs: 250,
  });

  assert.deepEqual(calls, [['load', 'HTTPS://Example.COM/path/#section']]);
  assert.equal(document.elements['#url-key'].textContent, 'https://example.com/path');
  assert.equal(document.elements['#note'].value, 'existing note');
  assert.equal(document.elements['#status'].textContent, 'Loaded.');
});

test('popup loads active tab domain note independently from the URL note', async () => {
  const document = createPopupDocument();
  const domainCalls = [];
  const urlStore = {
    async loadNote() { return 'page note'; },
    async saveNote() {},
    async exportNotes() { return { schemaVersion: 1, notes: {} }; },
    async importNotes() { return 0; },
    async listNotes() { return []; },
  };
  const domainStore = {
    async loadNote(url) {
      domainCalls.push(['load', url]);
      return 'site note';
    },
    async saveNote() {},
  };

  await initializePopup({
    document,
    adapter: createAdapter('HTTPS://Example.COM/path/?q=1#section'),
    createStore: () => urlStore,
    createDomainStore: () => domainStore,
  });

  assert.deepEqual(domainCalls, [['load', 'HTTPS://Example.COM/path/?q=1#section']]);
  assert.equal(document.elements['#domain-key'].textContent, 'example.com');
  assert.equal(document.elements['#domain-note'].value, 'site note');
  assert.equal(document.elements['#note'].value, 'page note');
});

test('popup loads ignore-query setting, updates the key, and creates a matching note store', async () => {
  const document = createPopupDocument();
  const storeCreations = [];
  const calls = [];
  const adapter = createAdapter('HTTPS://Example.COM/path/?utm_source=one#section', {
    'urlNotes.settings.ignoreQuery': true,
  });
  const store = {
    async loadNote(url) {
      calls.push(['load', url]);
      return 'shared note';
    },
    async saveNote() {},
    async exportNotes() { return { schemaVersion: 1, notes: {} }; },
    async importNotes() { return 0; },
    async listNotes() { return []; },
  };

  await initializePopup({
    document,
    adapter,
    createStore(storageArea, keyOptions) {
      storeCreations.push([storageArea, keyOptions]);
      return store;
    },
  });

  assert.equal(document.elements['#ignore-query'].checked, true);
  assert.equal(document.elements['#url-key'].textContent, 'https://example.com/path');
  assert.deepEqual(storeCreations.map(([, keyOptions]) => keyOptions), [{ ignoreQuery: true }]);
  assert.deepEqual(calls, [['load', 'HTTPS://Example.COM/path/?utm_source=one#section']]);
  assert.equal(document.elements['#note'].value, 'shared note');
});

test('popup persists ignore-query changes and reloads the current note with the new setting', async () => {
  const document = createPopupDocument();
  const adapter = createAdapter('https://example.com/path?tracking=1', {
    'urlNotes.settings.ignoreQuery': false,
  });
  const createdOptions = [];
  const loadOptions = [];

  await initializePopup({
    document,
    adapter,
    createStore(storageArea, keyOptions) {
      createdOptions.push(keyOptions);
      return {
        async loadNote() {
          loadOptions.push(keyOptions);
          return keyOptions.ignoreQuery ? 'query ignored note' : 'query note';
        },
        async saveNote() {},
        async exportNotes() { return { schemaVersion: 1, notes: {} }; },
        async importNotes() { return 0; },
        async listNotes() { return []; },
      };
    },
  });

  assert.equal(document.elements['#url-key'].textContent, 'https://example.com/path?tracking=1');
  assert.equal(document.elements['#note'].value, 'query note');

  document.elements['#ignore-query'].checked = true;
  await document.elements['#ignore-query'].dispatch('change');

  assert.equal(adapter.storage.local.data['urlNotes.settings.ignoreQuery'], true);
  assert.equal(document.elements['#url-key'].textContent, 'https://example.com/path');
  assert.equal(document.elements['#note'].value, 'query ignored note');
  assert.deepEqual(createdOptions, [{ ignoreQuery: false }, { ignoreQuery: true }]);
  assert.deepEqual(loadOptions, [{ ignoreQuery: false }, { ignoreQuery: true }]);
  assert.equal(document.elements['#status'].textContent, 'Loaded with query strings ignored.');
});

test('popup updates URL note markdown preview immediately while save remains debounced', async () => {
  const document = createPopupDocument();
  const timer = createManualTimer();
  const saved = [];
  const store = {
    async loadNote() { return ''; },
    async saveNote(url, noteText) { saved.push([url, noteText]); },
    async exportNotes() { return { schemaVersion: 1, notes: {} }; },
    async importNotes() { return 0; },
    async listNotes() { return []; },
  };
  await initializePopup({
    document,
    adapter: createAdapter(),
    createStore: () => store,
    debounceMs: 250,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
  });

  document.elements['#note'].value = '# Draft\n\nImmediate **preview**';
  document.elements['#note'].dispatch('input');

  assert.equal(document.elements['#status'].textContent, 'Saving…');
  assert.deepEqual(saved, []);
  assert.equal(document.elements['#note-preview'].children[0].tagName, 'h1');
  assert.equal(document.elements['#note-preview'].children[0].textContent, 'Draft');
  assert.equal(document.elements['#note-preview'].children[1].textContent, 'Immediate preview');

  await timer.runPending();

  assert.deepEqual(saved, [['https://example.com/page', '# Draft\n\nImmediate **preview**']]);
  assert.equal(document.elements['#status'].textContent, 'Saved.');
});

test('popup debounces note edits and reports saved status', async () => {
  const document = createPopupDocument();
  const timer = createManualTimer();
  const saved = [];
  const store = {
    async loadNote() { return ''; },
    async saveNote(url, noteText) { saved.push([url, noteText]); },
    async exportNotes() { return { schemaVersion: 1, notes: {} }; },
    async importNotes() { return 0; },
    async listNotes() { return []; },
  };
  await initializePopup({
    document,
    adapter: createAdapter(),
    createStore: () => store,
    debounceMs: 250,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
  });

  document.elements['#note'].value = 'draft note';
  document.elements['#note'].dispatch('input');
  assert.equal(document.elements['#status'].textContent, 'Saving…');
  await timer.runPending();

  assert.deepEqual(saved, [['https://example.com/page', 'draft note']]);
  assert.equal(document.elements['#status'].textContent, 'Saved.');
});

test('popup updates domain-note markdown preview immediately while save remains debounced', async () => {
  const document = createPopupDocument();
  const timer = createManualTimer();
  const saved = [];
  const urlStore = {
    async loadNote() { return ''; },
    async saveNote() {},
    async exportNotes() { return { schemaVersion: 1, notes: {} }; },
    async importNotes() { return 0; },
    async listNotes() { return []; },
  };
  const domainStore = {
    async loadNote() { return ''; },
    async saveNote(url, noteText) { saved.push([url, noteText]); },
  };

  await initializePopup({
    document,
    adapter: createAdapter('https://example.com/page'),
    createStore: () => urlStore,
    createDomainStore: () => domainStore,
    debounceMs: 250,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
  });

  document.elements['#domain-note'].value = 'Domain **draft**';
  document.elements['#domain-note'].dispatch('input');

  assert.equal(document.elements['#status'].textContent, 'Saving domain note…');
  assert.deepEqual(saved, []);
  assert.equal(document.elements['#domain-preview'].children[0].textContent, 'Domain draft');

  await timer.runPending();

  assert.deepEqual(saved, [['https://example.com/page', 'Domain **draft**']]);
  assert.equal(document.elements['#status'].textContent, 'Domain note saved.');
});

test('popup debounces domain note edits and reports saved status', async () => {
  const document = createPopupDocument();
  const timer = createManualTimer();
  const saved = [];
  const urlStore = {
    async loadNote() { return ''; },
    async saveNote() {},
    async exportNotes() { return { schemaVersion: 1, notes: {} }; },
    async importNotes() { return 0; },
    async listNotes() { return []; },
  };
  const domainStore = {
    async loadNote() { return ''; },
    async saveNote(url, noteText) { saved.push([url, noteText]); },
  };

  await initializePopup({
    document,
    adapter: createAdapter('https://example.com/page'),
    createStore: () => urlStore,
    createDomainStore: () => domainStore,
    debounceMs: 250,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
  });

  document.elements['#domain-note'].value = 'domain draft';
  document.elements['#domain-note'].dispatch('input');
  assert.equal(document.elements['#status'].textContent, 'Saving domain note…');
  await timer.runPending();

  assert.deepEqual(saved, [['https://example.com/page', 'domain draft']]);
  assert.equal(document.elements['#status'].textContent, 'Domain note saved.');
});

test('popup refreshes overview after saving a domain note', async () => {
  const document = createPopupDocument();
  const timer = createManualTimer();
  const domainNotes = [];
  const urlStore = {
    async loadNote() { return ''; },
    async saveNote() {},
    async exportNotes() { return { schemaVersion: 1, notes: {} }; },
    async importNotes() { return 0; },
    async listNotes() { return []; },
  };
  const domainStore = {
    async loadNote() { return ''; },
    async saveNote(_url, noteText) {
      domainNotes.splice(0, domainNotes.length, { domain: 'example.com', noteText });
    },
    async listNotes() { return [...domainNotes]; },
  };

  await initializePopup({
    document,
    adapter: createAdapter('https://example.com/page'),
    createStore: () => urlStore,
    createDomainStore: () => domainStore,
    debounceMs: 250,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
  });

  assert.equal(document.elements['#notes-list'].children.length, 0);

  document.elements['#domain-note'].value = 'domain draft';
  document.elements['#domain-note'].dispatch('input');
  await timer.runPending();

  assert.equal(document.elements['#notes-list'].children.length, 1);
  assert.equal(document.elements['#notes-list'].children[0].children[0].textContent, 'Domain note');
  assert.equal(document.elements['#notes-list'].children[0].children[1].textContent, 'example.com');
  assert.equal(document.elements['#notes-list'].children[0].children[2].textContent, 'domain draft');
});

test('popup refreshes overview after deleting a domain note', async () => {
  const document = createPopupDocument();
  const timer = createManualTimer();
  let domainNotes = [{ domain: 'example.com', noteText: 'old domain note' }];
  const urlStore = {
    async loadNote() { return ''; },
    async saveNote() {},
    async exportNotes() { return { schemaVersion: 1, notes: {} }; },
    async importNotes() { return 0; },
    async listNotes() { return []; },
  };
  const domainStore = {
    async loadNote() { return 'old domain note'; },
    async saveNote(_url, noteText) {
      if (String(noteText).trim() === '') domainNotes = [];
    },
    async listNotes() { return [...domainNotes]; },
  };

  await initializePopup({
    document,
    adapter: createAdapter('https://example.com/page'),
    createStore: () => urlStore,
    createDomainStore: () => domainStore,
    debounceMs: 250,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
  });

  assert.equal(document.elements['#notes-list'].children.length, 1);

  document.elements['#domain-note'].value = '   ';
  document.elements['#domain-note'].dispatch('input');
  await timer.runPending();

  assert.equal(document.elements['#notes-list'].children.length, 0);
  assert.equal(document.elements['#notes-empty'].textContent, 'No saved notes yet.');
});

test('popup keeps URL notes available but disables domain notes for active IPv6 hosts', async () => {
  const document = createPopupDocument();
  const domainCalls = [];
  const urlStore = {
    async loadNote() { return 'ipv6 page note'; },
    async saveNote() {},
    async exportNotes() { return { schemaVersion: 1, notes: {} }; },
    async importNotes() { return 0; },
    async listNotes() { return []; },
  };
  const domainStore = {
    async loadNote(url) { domainCalls.push(['load', url]); return 'should not load'; },
    async saveNote() { throw new Error('domain note should not save for IPv6 hosts'); },
    async listNotes() { return []; },
  };

  await initializePopup({
    document,
    adapter: createAdapter('https://[::1]/admin#section'),
    createStore: () => urlStore,
    createDomainStore: () => domainStore,
    debounceMs: 250,
  });

  assert.equal(document.elements['#url-key'].textContent, 'https://[::1]/admin');
  assert.equal(document.elements['#note'].value, 'ipv6 page note');
  assert.equal(document.elements['#note'].disabled, false);
  assert.equal(document.elements['#domain-key'].textContent, 'Domain notes unavailable for this URL.');
  assert.equal(document.elements['#domain-note'].value, '');
  assert.equal(document.elements['#domain-note'].disabled, true);
  assert.deepEqual(domainCalls, []);
  assert.equal(document.elements['#status'].textContent, 'Loaded.');
});

test('popup disables controls for non-web active URLs before loading notes', async () => {
  const document = createPopupDocument();
  const urlStore = {
    async loadNote() { throw new Error('URL note should not load for non-web URLs'); },
    async saveNote() { throw new Error('URL note should not save for non-web URLs'); },
    async exportNotes() { return { schemaVersion: 1, notes: {} }; },
    async importNotes() { return 0; },
    async listNotes() { return []; },
  };

  await initializePopup({
    document,
    adapter: createAdapter('file:///tmp/private.txt'),
    createStore: () => urlStore,
    debounceMs: 250,
  });

  assert.equal(document.elements['#url-key'].textContent, 'URL notes unavailable for this tab.');
  assert.equal(document.elements['#status'].textContent, 'Error: URL notes support only HTTP and HTTPS URLs');
  assert.equal(document.elements['#note'].disabled, true);
  assert.equal(document.elements['#domain-note'].disabled, true);
  assert.equal(document.elements['#ignore-query'].disabled, true);
  assert.equal(document.elements['#export-notes'].disabled, true);
  assert.equal(document.elements['#import-notes'].disabled, true);
  assert.equal(document.elements['#import-notes-label'].attributes.get('aria-disabled'), 'true');
  assert.equal(document.elements['#notes-search'].disabled, true);
});

test('popup keeps visible import label enabled on supported active tabs', async () => {
  const document = createPopupDocument();

  await initializePopup({ document, adapter: createAdapter('https://example.com/page'), debounceMs: 250 });

  assert.equal(document.elements['#import-notes'].disabled, false);
  assert.equal(document.elements['#import-notes-label'].attributes.get('aria-disabled'), undefined);
});

test('popup renders local markdown previews for URL and domain notes without unsafe links', async () => {
  const document = createPopupDocument();
  const timer = createManualTimer();
  const urlStore = {
    async loadNote() { return '# Page note\n[ok](https://example.com) [bad](javascript:alert(1)) <script>alert(1)</script>'; },
    async saveNote() {},
    async exportNotes() { return { schemaVersion: 1, notes: {} }; },
    async importNotes() { return 0; },
    async listNotes() { return []; },
  };
  const domainStore = {
    async loadNote() { return '**Domain** note'; },
    async saveNote() {},
    async listNotes() { return []; },
  };

  await initializePopup({
    document,
    adapter: createAdapter('https://example.com/page'),
    createStore: () => urlStore,
    createDomainStore: () => domainStore,
    debounceMs: 250,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
  });

  assert.equal(document.elements['#note-preview'].children[0].tagName, 'h1');
  assert.equal(document.elements['#note-preview'].children[0].textContent, 'Page note');
  const pageParagraph = document.elements['#note-preview'].children[1];
  const safeLink = pageParagraph.children.find((child) => child.tagName === 'a');
  assert.equal(safeLink.attributes.get('href'), 'https://example.com');
  assert.equal(safeLink.attributes.get('rel'), 'noopener noreferrer');
  assert.equal(pageParagraph.children.some((child) => child.textContent === 'bad' && child.attributes.get('href') === undefined), true);
  assert.equal(pageParagraph.textContent.includes('<script>alert(1)</script>'), true);
  assert.equal(document.elements['#domain-preview'].children[0].children[0].tagName, 'strong');
  assert.equal(document.elements['#domain-preview'].children[0].children[0].textContent, 'Domain');

  document.elements['#note'].value = 'Updated `code`';
  document.elements['#note'].dispatch('input');
  await timer.runPending();

  assert.equal(document.elements['#note-preview'].children[0].children[1].tagName, 'code');
  assert.equal(document.elements['#note-preview'].children[0].children[1].textContent, 'code');
});

test('popup treats blank edits as deleted notes', async () => {
  const document = createPopupDocument();
  const timer = createManualTimer();
  const saved = [];
  const store = {
    async loadNote() { return 'old note'; },
    async saveNote(url, noteText) { saved.push([url, noteText]); },
    async exportNotes() { return { schemaVersion: 1, notes: {} }; },
    async importNotes() { return 0; },
    async listNotes() { return []; },
  };
  await initializePopup({
    document,
    adapter: createAdapter(),
    createStore: () => store,
    debounceMs: 250,
    setTimeout: timer.setTimeout,
    clearTimeout: timer.clearTimeout,
  });

  document.elements['#note'].value = '   ';
  document.elements['#note'].dispatch('input');
  await timer.runPending();

  assert.deepEqual(saved, [['https://example.com/page', '   ']]);
  assert.equal(document.elements['#status'].textContent, 'Deleted.');
});

test('popup exports URL and domain notes as a schema-versioned JSON download', async () => {
  const document = createPopupDocument();
  const objectUrls = [];
  let revoked;
  const store = {
    async loadNote() { return ''; },
    async saveNote() {},
    async exportNotes() { return { schemaVersion: 1, notes: { 'https://example.com/page': 'note' } }; },
    async importNotes() { return 0; },
    async listNotes() { return []; },
  };
  const domainStore = {
    async loadNote() { return ''; },
    async saveNote() {},
    async exportNotes() { return { schemaVersion: 1, domainNotes: { 'example.com': 'domain note' } }; },
    async importNotes() { return 0; },
  };

  await initializePopup({
    document,
    adapter: createAdapter(),
    createStore: () => store,
    createDomainStore: () => domainStore,
    urlApi: {
      createObjectURL(blob) {
        objectUrls.push(blob);
        return 'blob:export-url';
      },
      revokeObjectURL(url) { revoked = url; },
    },
    BlobConstructor: class FakeBlob {
      constructor(parts, options) {
        this.text = parts.join('');
        this.type = options.type;
      }
    },
  });

  await document.elements['#export-notes'].dispatch('click');

  assert.equal(objectUrls[0].type, 'application/json');
  assert.match(objectUrls[0].text, /"schemaVersion": 1/);
  assert.match(objectUrls[0].text, /"https:\/\/example.com\/page": "note"/);
  assert.match(objectUrls[0].text, /"example.com": "domain note"/);
  assert.equal(document.anchors[0].attributes.get('download'), 'url-notes-export.json');
  assert.equal(document.anchors[0].attributes.get('href'), 'blob:export-url');
  assert.equal(document.anchors[0].clicked, true);
  assert.equal(revoked, 'blob:export-url');
  assert.equal(document.elements['#status'].textContent, 'Exported JSON.');
});

test('popup imports JSON, merges via URL and domain note stores, and reloads the current note', async () => {
  const document = createPopupDocument();
  const urlImports = [];
  const domainImports = [];
  const store = {
    async loadNote() { return urlImports.length ? 'imported current note' : ''; },
    async saveNote() {},
    async exportNotes() { return { schemaVersion: 1, notes: {} }; },
    async importNotes(payload) {
      urlImports.push(payload);
      return 2;
    },
    async listNotes() { return []; },
  };
  const domainStore = {
    async loadNote() { return domainImports.length ? 'imported domain note' : ''; },
    async saveNote() {},
    async exportNotes() { return { schemaVersion: 1, domainNotes: {} }; },
    async importNotes(payload) {
      domainImports.push(payload);
      return 1;
    },
  };
  await initializePopup({ document, adapter: createAdapter(), createStore: () => store, createDomainStore: () => domainStore });

  const importInput = document.elements['#import-notes'];
  importInput.value = 'C:\\fakepath\\backup.json';
  importInput.files = [{ text: async () => '{"schemaVersion":1,"notes":{"https://example.com/page":"imported current note"},"domainNotes":{"example.com":"imported domain note"}}' }];
  await importInput.dispatch('change');

  assert.deepEqual(urlImports, [{ schemaVersion: 1, notes: { 'https://example.com/page': 'imported current note' }, domainNotes: { 'example.com': 'imported domain note' } }]);
  assert.deepEqual(domainImports, [{ schemaVersion: 1, notes: { 'https://example.com/page': 'imported current note' }, domainNotes: { 'example.com': 'imported domain note' } }]);
  assert.equal(document.elements['#note'].value, 'imported current note');
  assert.equal(document.elements['#domain-note'].value, 'imported domain note');
  assert.equal(importInput.value, '');
  assert.equal(document.elements['#status'].textContent, 'Imported 3 notes.');
});

test('popup reports invalid import errors without reloading the current note', async () => {
  const document = createPopupDocument();
  let loadCount = 0;
  const store = {
    async loadNote() {
      loadCount += 1;
      return 'existing note';
    },
    async saveNote() {},
    async exportNotes() { return { schemaVersion: 1, notes: {} }; },
    async importNotes() { throw new Error('Unsupported URL notes export format'); },
    async listNotes() { return []; },
  };
  await initializePopup({ document, adapter: createAdapter(), createStore: () => store });

  await document.elements['#import-notes'].dispatch('change', {
    target: { files: [{ text: async () => '{"schemaVersion":999,"notes":{}}' }] },
  });

  assert.equal(loadCount, 1);
  assert.equal(document.elements['#note'].value, 'existing note');
  assert.equal(document.elements['#status'].textContent, 'Error: Unsupported URL notes export format');
});

test('popup does not import domain notes when combined JSON import has invalid URL notes', async () => {
  const document = createPopupDocument();
  const adapter = createAdapter('https://example.com/current');
  await initializePopup({ document, adapter });

  await document.elements['#import-notes'].dispatch('change', {
    target: {
      files: [{
        text: async () => JSON.stringify({
          schemaVersion: 1,
          notes: { 'not a url': 'invalid page note' },
          domainNotes: { 'example.com': 'should not be imported' },
        }),
      }],
    },
  });

  assert.equal(adapter.storage.local.data['urlNotes.domainNotes.example.com'], undefined);
  assert.equal(document.elements['#domain-note'].value, '');
  assert.equal(document.elements['#status'].textContent, 'Error: Unsupported URL notes export format');
});

test('popup rejects array-shaped domain-note imports before committing URL notes', async () => {
  const document = createPopupDocument();
  const adapter = createAdapter('https://example.com/current');
  await initializePopup({ document, adapter });

  await document.elements['#import-notes'].dispatch('change', {
    target: {
      files: [{
        text: async () => JSON.stringify({
          schemaVersion: 1,
          notes: { 'https://example.com/page': 'should not be imported' },
          domainNotes: ['array note should not become a numeric host'],
        }),
      }],
    },
  });

  assert.equal(adapter.storage.local.data['urlNotes.notes.https://example.com/page'], undefined);
  assert.equal(adapter.storage.local.data['urlNotes.domainNotes.0.0.0.0'], undefined);
  assert.equal(document.elements['#note'].value, '');
  assert.equal(document.elements['#domain-note'].value, '');
  assert.equal(document.elements['#status'].textContent, 'Error: Unsupported URL notes export format');
});

test('popup rejects array-shaped URL-note imports before committing domain notes', async () => {
  const document = createPopupDocument();
  const adapter = createAdapter('https://example.com/current');
  await initializePopup({ document, adapter });

  await document.elements['#import-notes'].dispatch('change', {
    target: {
      files: [{
        text: async () => JSON.stringify({
          schemaVersion: 1,
          notes: [],
          domainNotes: { 'example.com': 'should not be imported' },
        }),
      }],
    },
  });

  assert.equal(adapter.storage.local.data['urlNotes.domainNotes.example.com'], undefined);
  assert.equal(document.elements['#note'].value, '');
  assert.equal(document.elements['#domain-note'].value, '');
  assert.equal(document.elements['#status'].textContent, 'Error: Unsupported URL notes export format');
});

test('popup keeps JSON import usable on supported active tabs', async () => {
  const document = createPopupDocument();
  const adapter = createAdapter('https://current.example/page');
  await initializePopup({ document, adapter });

  await document.elements['#import-notes'].dispatch('change', {
    target: {
      files: [{
        text: async () => JSON.stringify({
          schemaVersion: 1,
          notes: { 'https://example.com/page': 'imported page note' },
          domainNotes: { 'example.com': 'imported domain note' },
        }),
      }],
    },
  });

  assert.equal(adapter.storage.local.data['urlNotes.notes.https://example.com/page'], 'imported page note');
  assert.equal(adapter.storage.local.data['urlNotes.domainNotes.example.com'], 'imported domain note');
  assert.equal(document.elements['#domain-note'].disabled, false);
  assert.equal(document.elements['#status'].textContent, 'Imported 2 notes.');
});

test('popup leaves no partial combined JSON import when shared storage rejects a URL note key', async () => {
  const document = createPopupDocument();
  const adapter = createAdapter('https://current.example/page');
  const originalSet = adapter.storage.local.set;
  adapter.storage.local.set = async (items) => {
    if (Object.hasOwn(items, 'urlNotes.notes.https://example.com/page')) {
      throw new Error('storage write rejected for URL note');
    }
    await originalSet.call(adapter.storage.local, items);
  };
  await initializePopup({ document, adapter });

  const importInput = document.elements['#import-notes'];
  importInput.value = 'C:\\fakepath\\backup.json';
  importInput.files = [{
    text: async () => JSON.stringify({
      schemaVersion: 1,
      domainNotes: { 'example.com': 'should not be imported' },
      notes: { 'https://example.com/page': 'should not be imported' },
    }),
  }];
  await importInput.dispatch('change');

  assert.equal(adapter.storage.local.data['urlNotes.domainNotes.example.com'], undefined);
  assert.equal(adapter.storage.local.data['urlNotes.notes.https://example.com/page'], undefined);
  assert.equal(document.elements['#domain-note'].value, '');
  assert.equal(document.elements['#note'].value, '');
  assert.equal(importInput.value, '');
  assert.equal(document.elements['#status'].textContent, 'Error: storage write rejected for URL note');
});

test('popup renders stale credential-bearing URL note overview keys as non-clickable text', async () => {
  const document = createPopupDocument();
  const store = {
    async loadNote() { return ''; },
    async saveNote() {},
    async exportNotes() { return { schemaVersion: 1, notes: {} }; },
    async importNotes() { return 0; },
    async listNotes() {
      return [
        { url: 'https://example.com/safe', noteText: 'safe note' },
        { url: 'https://user@example.com/hidden', noteText: 'stale userinfo note' },
        { url: 'https://user:pass@example.com/hidden', noteText: 'stale password note' },
      ];
    },
  };
  const domainStore = {
    async loadNote() { return ''; },
    async saveNote() {},
    async exportNotes() { return { schemaVersion: 1, domainNotes: {} }; },
    async importNotes() { return 0; },
    async listNotes() { return []; },
  };

  await initializePopup({ document, adapter: createAdapter(), createStore: () => store, createDomainStore: () => domainStore });

  assert.equal(document.elements['#notes-list'].children[0].children[1].textContent, 'https://example.com/safe');
  assert.equal(document.elements['#notes-list'].children[0].children[1].attributes.get('href'), 'https://example.com/safe');
  assert.equal(document.elements['#notes-list'].children[0].children[1].attributes.get('target'), '_blank');
  assert.equal(document.elements['#notes-list'].children[0].children[1].attributes.get('rel'), 'noopener noreferrer');
  assert.equal(document.elements['#notes-list'].children[1].children[1].textContent, 'https://user@example.com/hidden');
  assert.equal(document.elements['#notes-list'].children[1].children[1].attributes.get('href'), undefined);
  assert.equal(document.elements['#notes-list'].children[1].children[1].attributes.get('target'), undefined);
  assert.equal(document.elements['#notes-list'].children[1].children[1].attributes.get('rel'), undefined);
  assert.equal(document.elements['#notes-list'].children[2].children[1].textContent, 'https://user:pass@example.com/hidden');
  assert.equal(document.elements['#notes-list'].children[2].children[1].attributes.get('href'), undefined);
  assert.equal(document.elements['#notes-list'].children[2].children[1].attributes.get('target'), undefined);
  assert.equal(document.elements['#notes-list'].children[2].children[1].attributes.get('rel'), undefined);
});

test('popup lists URL and domain notes and filters by key or note text', async () => {
  const document = createPopupDocument();
  const store = {
    async loadNote() { return ''; },
    async saveNote() {},
    async exportNotes() { return { schemaVersion: 1, notes: {} }; },
    async importNotes() { return 0; },
    async listNotes() {
      return [
        { url: 'https://example.com/alpha', noteText: 'meeting notes' },
        { url: 'https://example.org/bravo', noteText: 'recipe draft' },
        { url: 'javascript:alert(1)', noteText: 'unsafe stale imported note' },
      ];
    },
  };
  const domainStore = {
    async loadNote() { return ''; },
    async saveNote() {},
    async exportNotes() { return { schemaVersion: 1, domainNotes: {} }; },
    async importNotes() { return 0; },
    async listNotes() {
      return [
        { domain: 'example.net', noteText: 'site-wide checklist' },
        { domain: 'user@example.org', noteText: 'stale confusable domain key' },
        { domain: 'example..com', noteText: 'stale empty-label domain key' },
        { domain: '-bad.example', noteText: 'stale leading-hyphen domain key' },
        { domain: 'bad_domain.example', noteText: 'stale underscore domain key' },
      ];
    },
  };

  await initializePopup({ document, adapter: createAdapter(), createStore: () => store, createDomainStore: () => domainStore });

  assert.equal(document.elements['#notes-list'].children.length, 8);
  assert.equal(document.elements['#notes-list'].children[0].children[0].textContent, 'URL note');
  assert.equal(document.elements['#notes-list'].children[0].children[1].textContent, 'https://example.com/alpha');
  assert.equal(document.elements['#notes-list'].children[0].children[1].attributes.get('href'), 'https://example.com/alpha');
  assert.equal(document.elements['#notes-list'].children[0].children[1].attributes.get('target'), '_blank');
  assert.equal(document.elements['#notes-list'].children[0].children[1].attributes.get('rel'), 'noopener noreferrer');
  assert.equal(document.elements['#notes-list'].children[2].children[0].textContent, 'URL note');
  assert.equal(document.elements['#notes-list'].children[2].children[1].textContent, 'javascript:alert(1)');
  assert.equal(document.elements['#notes-list'].children[2].children[1].attributes.get('href'), undefined);
  assert.equal(document.elements['#notes-list'].children[3].children[0].textContent, 'Domain note');
  assert.equal(document.elements['#notes-list'].children[3].children[1].textContent, 'example.net');
  assert.equal(document.elements['#notes-list'].children[3].children[1].attributes.get('href'), 'https://example.net/');
  assert.equal(document.elements['#notes-list'].children[3].children[1].attributes.get('rel'), 'noopener noreferrer');
  assert.equal(document.elements['#notes-list'].children[4].children[0].textContent, 'Domain note');
  assert.equal(document.elements['#notes-list'].children[4].children[1].textContent, 'user@example.org');
  assert.equal(document.elements['#notes-list'].children[4].children[1].attributes.get('href'), undefined);
  assert.equal(document.elements['#notes-list'].children[4].children[1].attributes.get('target'), undefined);
  assert.equal(document.elements['#notes-list'].children[4].children[1].attributes.get('rel'), undefined);
  assert.equal(document.elements['#notes-list'].children[5].children[1].textContent, 'example..com');
  assert.equal(document.elements['#notes-list'].children[5].children[1].attributes.get('href'), undefined);
  assert.equal(document.elements['#notes-list'].children[5].children[1].attributes.get('target'), undefined);
  assert.equal(document.elements['#notes-list'].children[5].children[1].attributes.get('rel'), undefined);
  assert.equal(document.elements['#notes-list'].children[6].children[1].textContent, '-bad.example');
  assert.equal(document.elements['#notes-list'].children[6].children[1].attributes.get('href'), undefined);
  assert.equal(document.elements['#notes-list'].children[6].children[1].attributes.get('target'), undefined);
  assert.equal(document.elements['#notes-list'].children[6].children[1].attributes.get('rel'), undefined);
  assert.equal(document.elements['#notes-list'].children[7].children[1].textContent, 'bad_domain.example');
  assert.equal(document.elements['#notes-list'].children[7].children[1].attributes.get('href'), undefined);
  assert.equal(document.elements['#notes-list'].children[7].children[1].attributes.get('target'), undefined);
  assert.equal(document.elements['#notes-list'].children[7].children[1].attributes.get('rel'), undefined);
  assert.equal(document.elements['#notes-empty'].textContent, '');

  document.elements['#notes-search'].value = 'recipe';
  document.elements['#notes-search'].dispatch('input');

  assert.equal(document.elements['#notes-list'].children.length, 1);
  assert.equal(document.elements['#notes-list'].children[0].children[1].textContent, 'https://example.org/bravo');

  document.elements['#notes-search'].value = 'site-wide';
  document.elements['#notes-search'].dispatch('input');

  assert.equal(document.elements['#notes-list'].children.length, 1);
  assert.equal(document.elements['#notes-list'].children[0].children[0].textContent, 'Domain note');
  assert.equal(document.elements['#notes-list'].children[0].children[1].textContent, 'example.net');

  document.elements['#notes-search'].value = 'missing';
  document.elements['#notes-search'].dispatch('input');

  assert.equal(document.elements['#notes-list'].children.length, 0);
  assert.equal(document.elements['#notes-empty'].textContent, 'No matching notes.');
});

test('popup disables controls and shows a clear key message when initialization fails', async () => {
  const document = createPopupDocument();

  await initializePopup({
    document,
    adapter: createAdapter(undefined),
    createStore: () => ({ async loadNote() { return ''; }, async saveNote() {} }),
    debounceMs: 250,
  });

  assert.equal(document.elements['#url-key'].textContent, 'URL notes unavailable for this tab.');
  assert.equal(document.elements['#status'].textContent, 'Error: Active tab has no URL.');
  assert.equal(document.elements['#note'].disabled, true);
  assert.equal(document.elements['#domain-note'].disabled, true);
  assert.equal(document.elements['#ignore-query'].disabled, true);
  assert.equal(document.elements['#export-notes'].disabled, true);
  assert.equal(document.elements['#import-notes'].disabled, true);
  assert.equal(document.elements['#import-notes-label'].attributes.get('aria-disabled'), 'true');
  assert.equal(document.elements['#notes-search'].disabled, true);
});
