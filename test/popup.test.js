import test from 'node:test';
import assert from 'node:assert/strict';

import { initializePopup } from '../src/popup.js';

class FakeElement {
  constructor({ value = '', textContent = '' } = {}) {
    this.value = value;
    this.textContent = textContent;
    this.listeners = new Map();
    this.attributes = new Map();
    this.clicked = false;
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
  };
  return {
    elements,
    anchors,
    querySelector(selector) {
      return elements[selector] ?? null;
    },
    createElement(tagName) {
      assert.equal(tagName, 'a');
      const anchor = new FakeElement();
      anchors.push(anchor);
      return anchor;
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

function createAdapter(url) {
  const activeUrl = arguments.length === 0 ? 'https://example.com/page' : url;
  return { getActiveTab: async () => ({ url: activeUrl }), storage: { local: {} } };
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

test('popup debounces note edits and reports saved status', async () => {
  const document = createPopupDocument();
  const timer = createManualTimer();
  const saved = [];
  const store = {
    async loadNote() { return ''; },
    async saveNote(url, noteText) { saved.push([url, noteText]); },
    async exportNotes() { return { schemaVersion: 1, notes: {} }; },
    async importNotes() { return 0; },
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

test('popup treats blank edits as deleted notes', async () => {
  const document = createPopupDocument();
  const timer = createManualTimer();
  const saved = [];
  const store = {
    async loadNote() { return 'old note'; },
    async saveNote(url, noteText) { saved.push([url, noteText]); },
    async exportNotes() { return { schemaVersion: 1, notes: {} }; },
    async importNotes() { return 0; },
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

test('popup exports notes as a schema-versioned JSON download', async () => {
  const document = createPopupDocument();
  const objectUrls = [];
  let revoked;
  const store = {
    async loadNote() { return ''; },
    async saveNote() {},
    async exportNotes() { return { schemaVersion: 1, notes: { 'https://example.com/page': 'note' } }; },
    async importNotes() { return 0; },
  };

  await initializePopup({
    document,
    adapter: createAdapter(),
    createStore: () => store,
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
  assert.equal(document.anchors[0].attributes.get('download'), 'url-notes-export.json');
  assert.equal(document.anchors[0].attributes.get('href'), 'blob:export-url');
  assert.equal(document.anchors[0].clicked, true);
  assert.equal(revoked, 'blob:export-url');
  assert.equal(document.elements['#status'].textContent, 'Exported JSON.');
});

test('popup imports JSON, merges via the note store, and reloads the current note', async () => {
  const document = createPopupDocument();
  const imported = [];
  const store = {
    async loadNote() { return imported.length ? 'imported current note' : ''; },
    async saveNote() {},
    async exportNotes() { return { schemaVersion: 1, notes: {} }; },
    async importNotes(payload) {
      imported.push(payload);
      return 2;
    },
  };
  await initializePopup({ document, adapter: createAdapter(), createStore: () => store });

  await document.elements['#import-notes'].dispatch('change', {
    target: { files: [{ text: async () => '{"schemaVersion":1,"notes":{"https://example.com/page":"imported current note"}}' }] },
  });

  assert.deepEqual(imported, [{ schemaVersion: 1, notes: { 'https://example.com/page': 'imported current note' } }]);
  assert.equal(document.elements['#note'].value, 'imported current note');
  assert.equal(document.elements['#status'].textContent, 'Imported 2 notes.');
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
  };
  await initializePopup({ document, adapter: createAdapter(), createStore: () => store });

  await document.elements['#import-notes'].dispatch('change', {
    target: { files: [{ text: async () => '{"schemaVersion":999,"notes":{}}' }] },
  });

  assert.equal(loadCount, 1);
  assert.equal(document.elements['#note'].value, 'existing note');
  assert.equal(document.elements['#status'].textContent, 'Error: Unsupported URL notes export format');
});

test('popup reports errors without throwing during initialization', async () => {
  const document = createPopupDocument();

  await initializePopup({
    document,
    adapter: createAdapter(undefined),
    createStore: () => ({ async loadNote() { return ''; }, async saveNote() {} }),
    debounceMs: 250,
  });

  assert.equal(document.elements['#status'].textContent, 'Error: Active tab has no URL.');
});
