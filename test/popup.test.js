import test from 'node:test';
import assert from 'node:assert/strict';

import { initializePopup } from '../src/popup.js';

class FakeElement {
  constructor({ value = '', textContent = '' } = {}) {
    this.value = value;
    this.textContent = textContent;
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  dispatch(type, event = { target: this }) {
    const listener = this.listeners.get(type);
    assert.ok(listener, `expected ${type} listener to be registered`);
    return listener(event);
  }
}

function createPopupDocument() {
  const elements = {
    '#url-key': new FakeElement(),
    '#note': new FakeElement(),
    '#status': new FakeElement(),
  };
  return {
    elements,
    querySelector(selector) {
      return elements[selector] ?? null;
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
  };

  await initializePopup({
    document,
    adapter: { getActiveTab: async () => ({ url: 'HTTPS://Example.COM/path/#section' }), storage: { local: {} } },
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
  };
  await initializePopup({
    document,
    adapter: { getActiveTab: async () => ({ url: 'https://example.com/page' }), storage: { local: {} } },
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
  };
  await initializePopup({
    document,
    adapter: { getActiveTab: async () => ({ url: 'https://example.com/page' }), storage: { local: {} } },
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

test('popup reports errors without throwing during initialization', async () => {
  const document = createPopupDocument();

  await initializePopup({
    document,
    adapter: { getActiveTab: async () => ({ url: undefined }), storage: { local: {} } },
    createStore: () => ({ async loadNote() { return ''; }, async saveNote() {} }),
    debounceMs: 250,
  });

  assert.equal(document.elements['#status'].textContent, 'Error: Active tab has no URL.');
});
