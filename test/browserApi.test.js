import test from 'node:test';
import assert from 'node:assert/strict';

import { createBrowserAdapter } from '../src/browserApi.js';

test('browser adapter uses browser promise storage and active tab APIs', async () => {
  const calls = [];
  const adapter = createBrowserAdapter({
    browser: {
      storage: {
        local: {
          get: async (key) => ({ [key]: 'value' }),
          set: async (items) => calls.push(['set', items]),
          remove: async (key) => calls.push(['remove', key]),
        },
      },
      tabs: {
        query: async (queryInfo) => {
          calls.push(['query', queryInfo]);
          return [{ id: 7, url: 'https://example.com/current' }];
        },
      },
    },
  });

  assert.deepEqual(await adapter.storage.local.get('note'), { note: 'value' });
  await adapter.storage.local.set({ note: 'new' });
  await adapter.storage.local.remove('note');
  assert.deepEqual(await adapter.getActiveTab(), { id: 7, url: 'https://example.com/current' });
  assert.deepEqual(calls, [
    ['set', { note: 'new' }],
    ['remove', 'note'],
    ['query', { active: true, currentWindow: true }],
  ]);
});

test('browser adapter promisifies chrome callback storage and active tab APIs', async () => {
  const stored = { note: 'chrome value' };
  const adapter = createBrowserAdapter({
    chrome: {
      runtime: { lastError: null },
      storage: {
        local: {
          get(key, callback) {
            callback({ [key]: stored[key] });
          },
          set(items, callback) {
            Object.assign(stored, items);
            callback();
          },
          remove(key, callback) {
            delete stored[key];
            callback();
          },
        },
      },
      tabs: {
        query(queryInfo, callback) {
          assert.deepEqual(queryInfo, { active: true, currentWindow: true });
          callback([{ id: 11, url: 'https://edge.example/current' }]);
        },
      },
    },
  });

  assert.deepEqual(await adapter.storage.local.get('note'), { note: 'chrome value' });
  await adapter.storage.local.set({ note: 'updated' });
  assert.equal(stored.note, 'updated');
  await adapter.storage.local.remove('note');
  assert.deepEqual(await adapter.getActiveTab(), { id: 11, url: 'https://edge.example/current' });
});

test('browser adapter invokes chrome callback APIs with their owning objects', async () => {
  const storageLocal = {
    get(_key, callback) {
      assert.equal(this, storageLocal);
      callback({ note: 'bound storage' });
    },
    set(_items, callback) {
      assert.equal(this, storageLocal);
      callback();
    },
    remove(_key, callback) {
      assert.equal(this, storageLocal);
      callback();
    },
  };
  const tabs = {
    query(_queryInfo, callback) {
      assert.equal(this, tabs);
      callback([{ id: 12, url: 'https://edge.example/bound' }]);
    },
  };
  const adapter = createBrowserAdapter({
    chrome: {
      runtime: { lastError: null },
      storage: { local: storageLocal },
      tabs,
    },
  });

  assert.deepEqual(await adapter.storage.local.get('note'), { note: 'bound storage' });
  await adapter.storage.local.set({ note: 'updated' });
  await adapter.storage.local.remove('note');
  assert.deepEqual(await adapter.getActiveTab(), { id: 12, url: 'https://edge.example/bound' });
});

test('browser adapter rejects chrome callback APIs when runtime.lastError is set', async () => {
  const chrome = {
    runtime: { lastError: null },
    storage: {
      local: {
        get(_key, callback) {
          chrome.runtime.lastError = { message: 'storage failed' };
          callback({});
        },
      },
    },
    tabs: { query(_queryInfo, callback) { callback([]); } },
  };
  const adapter = createBrowserAdapter({ chrome });

  await assert.rejects(() => adapter.storage.local.get('note'), /storage failed/);
});

test('browser adapter rejects chrome callback APIs without mutating read-only runtime.lastError', async () => {
  const chrome = {
    runtime: {},
    storage: {
      local: {
        get(_key, callback) {
          callback({});
        },
      },
    },
    tabs: { query(_queryInfo, callback) { callback([]); } },
  };
  Object.defineProperty(chrome.runtime, 'lastError', {
    get: () => ({ message: 'read-only storage failed' }),
  });
  const adapter = createBrowserAdapter({ chrome });

  await assert.rejects(() => adapter.storage.local.get('note'), /read-only storage failed/);
});
