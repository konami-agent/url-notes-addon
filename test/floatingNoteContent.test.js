import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.textContent = '';
    this.value = '';
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.removed = false;
    this.style = {};
    this.shadowRoot = null;
  }

  setAttribute(name, value) { this.attributes.set(name, value); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  attachShadow() { this.shadowRoot = new FakeElement('shadow-root'); return this.shadowRoot; }
  remove() { this.removed = true; }
  dispatch(type, event = {}) { return this.listeners.get(type)?.(event); }
  querySelector(selector) {
    const stack = [...this.children];
    while (stack.length > 0) {
      const current = stack.shift();
      if (current.removed) continue;
      if (selector.startsWith('#') && current.attributes.get('id') === selector.slice(1)) return current;
      if (selector.startsWith('.') && String(current.attributes.get('class') ?? '').split(/\s+/u).includes(selector.slice(1))) return current;
      stack.push(...current.children);
      if (current.shadowRoot) stack.push(current.shadowRoot);
    }
    return null;
  }
}

function createFakeDocument() {
  const body = new FakeElement('body');
  const document = {
    body,
    listeners: new Map(),
    createElement(tagName) { return new FakeElement(tagName); },
    getElementById(id) { return body.querySelector(`#${id}`); },
    addEventListener(type, listener) { this.listeners.set(type, listener); },
    removeEventListener(type) { this.listeners.delete(type); },
  };
  return document;
}

function createStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    async get(key) { return Object.hasOwn(data, key) ? { [key]: data[key] } : {}; },
    async set(items) { Object.assign(data, items); },
    async remove(key) { delete data[key]; },
  };
}

function createChromeCallbackStorage(initial = {}) {
  const data = { ...initial };
  const storage = {
    data,
    get(key, callback) {
      assert.equal(this, storage);
      callback(Object.hasOwn(data, key) ? { [key]: data[key] } : {});
    },
    set(items, callback) {
      assert.equal(this, storage);
      Object.assign(data, items);
      callback();
    },
    remove(key, callback) {
      assert.equal(this, storage);
      delete data[key];
      callback();
    },
  };
  return storage;
}

async function runFloatingNoteScript(context) {
  const code = await readFile(new URL('../src/floatingNoteContent.js', import.meta.url), 'utf8');
  vm.runInNewContext(code, context, { filename: 'floatingNoteContent.js' });
  await context.__urlNotesFloatingNote.ready;
}

async function loadFloatingNoteHarness({ href = 'https://example.com/page#section', initialStorage = {}, api = 'browser' } = {}) {
  const document = createFakeDocument();
  const storage = api === 'chrome' ? createChromeCallbackStorage(initialStorage) : createStorage(initialStorage);
  const context = {
    console: { error() {} },
    URL,
    setTimeout,
    clearTimeout,
    document,
    location: { href },
  };
  if (api === 'chrome') context.chrome = { runtime: {}, storage: { local: storage } };
  else context.browser = { runtime: {}, storage: { local: storage } };
  context.globalThis = context;
  await runFloatingNoteScript(context);
  return { context, document, storage };
}

test('floating note content script creates a contained panel for the normalized current URL note', async () => {
  const { context, document } = await loadFloatingNoteHarness({
    href: 'HTTPS://Example.COM/path/#section',
    initialStorage: { 'urlNotes.notes.https://example.com/path': 'existing note' },
  });

  const root = document.getElementById('url-notes-floating-root');
  assert.ok(root);
  assert.equal(context.__urlNotesFloatingNote.normalizeUrlForNoteKey('HTTPS://Example.COM/path/#section'), 'https://example.com/path');
  const textarea = root.shadowRoot.querySelector('.url-notes-floating-textarea');
  assert.equal(textarea.value, 'existing note');
});

test('floating note content script saves edits to the same URL-note storage key and closes on Escape', async () => {
  const { document, storage } = await loadFloatingNoteHarness({ href: 'https://example.com/page?x=1#section' });
  const root = document.getElementById('url-notes-floating-root');
  const textarea = root.shadowRoot.querySelector('.url-notes-floating-textarea');

  textarea.value = 'floating draft';
  await textarea.dispatch('input');

  assert.equal(storage.data['urlNotes.notes.https://example.com/page?x=1'], 'floating draft');
  document.listeners.get('keydown')({ key: 'Escape' });
  assert.equal(root.removed, true);
});

test('floating note content script rejects unsupported active URLs without creating a panel', async () => {
  await assert.rejects(
    () => loadFloatingNoteHarness({ href: 'file:///tmp/private.txt' }),
    /URL notes support only HTTP and HTTPS URLs/,
  );
});


test('floating note content script supports chrome callback storage APIs with owning receivers', async () => {
  const { document, storage } = await loadFloatingNoteHarness({
    api: 'chrome',
    href: 'https://example.com/chrome',
    initialStorage: { 'urlNotes.notes.https://example.com/chrome': 'chrome note' },
  });

  const root = document.getElementById('url-notes-floating-root');
  const textarea = root.shadowRoot.querySelector('.url-notes-floating-textarea');
  assert.equal(textarea.value, 'chrome note');

  textarea.value = '';
  await textarea.dispatch('input');
  assert.equal(Object.hasOwn(storage.data, 'urlNotes.notes.https://example.com/chrome'), false);
});

test('floating note content script toggles off with cleanup when injected again', async () => {
  const { context, document } = await loadFloatingNoteHarness({ href: 'https://example.com/toggle' });
  const root = document.getElementById('url-notes-floating-root');
  assert.ok(root);
  assert.equal(document.listeners.has('keydown'), true);

  await runFloatingNoteScript(context);

  assert.equal(root.removed, true);
  assert.equal(document.listeners.has('keydown'), false);
  assert.equal(document.getElementById('url-notes-floating-root'), null);
});

test('floating note content script rejects credential-bearing active URLs without creating a panel', async () => {
  await assert.rejects(
    () => loadFloatingNoteHarness({ href: 'https://user@example.com/private' }),
    /credential-bearing URLs/,
  );
});
