import test from 'node:test';
import assert from 'node:assert/strict';

import { renderMarkdownPreview } from '../src/markdownPreview.js';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.textContent = '';
    this.attributes = new Map();
    this.children = [];
  }

  append(...children) {
    this.children.push(...children);
    this.textContent += children.map((child) => child.textContent ?? '').join('');
  }

  replaceChildren(...children) {
    this.children = children;
    this.textContent = children.map((child) => child.textContent ?? '').join('');
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }
}

function createDocument() {
  return {
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };
}

test('markdown preview renders safe subset with text nodes and safe links', () => {
  const container = new FakeElement('div');

  renderMarkdownPreview({
    document: createDocument(),
    container,
    markdown: '# Title\n\nA **bold** and *em* note with `code` and [site](https://example.com/path).\n\n- one\n- two\n\n```\n<script>alert(1)</script>\n```',
  });

  assert.equal(container.children[0].tagName, 'h1');
  assert.equal(container.children[0].textContent, 'Title');
  assert.equal(container.children[1].tagName, 'p');
  assert.equal(container.children[1].children.some((child) => child.tagName === 'strong' && child.textContent === 'bold'), true);
  assert.equal(container.children[1].children.some((child) => child.tagName === 'em' && child.textContent === 'em'), true);
  assert.equal(container.children[1].children.some((child) => child.tagName === 'code' && child.textContent === 'code'), true);
  const link = container.children[1].children.find((child) => child.tagName === 'a');
  assert.equal(link.textContent, 'site');
  assert.equal(link.attributes.get('href'), 'https://example.com/path');
  assert.equal(link.attributes.get('target'), '_blank');
  assert.equal(link.attributes.get('rel'), 'noopener noreferrer');
  assert.equal(container.children[2].tagName, 'ul');
  assert.deepEqual(container.children[2].children.map((child) => child.textContent), ['one', 'two']);
  assert.equal(container.children[3].tagName, 'pre');
  assert.equal(container.children[3].children[0].tagName, 'code');
  assert.equal(container.children[3].children[0].textContent, '<script>alert(1)</script>');
});

test('markdown preview treats raw HTML and unsafe links as non-clickable text', () => {
  const container = new FakeElement('div');

  renderMarkdownPreview({
    document: createDocument(),
    container,
    markdown: '<img src=x onerror=alert(1)> [bad](javascript:alert(1)) [data](data:text/html,boom)',
  });

  assert.equal(container.children.length, 1);
  assert.equal(container.children[0].tagName, 'p');
  assert.equal(container.children[0].textContent.includes('<img src=x onerror=alert(1)>'), true);
  const clickable = container.children[0].children.filter((child) => child.tagName === 'a');
  assert.equal(clickable.length, 0);
  assert.equal(container.children[0].children.some((child) => child.textContent === 'bad'), true);
  assert.equal(container.children[0].children.some((child) => child.textContent === 'data'), true);
});

test('markdown preview rejects credential-bearing links', () => {
  const container = new FakeElement('div');

  renderMarkdownPreview({
    document: createDocument(),
    container,
    markdown: '[safe](https://example.com/path) [user](https://user@example.com/) [password](https://user:secret@example.com/)',
  });

  const clickable = container.children[0].children.filter((child) => child.tagName === 'a');
  assert.equal(clickable.length, 1);
  assert.equal(clickable[0].textContent, 'safe');
  assert.equal(clickable[0].attributes.get('href'), 'https://example.com/path');
  assert.equal(container.children[0].children.some((child) => child.textContent === 'user' && !child.attributes.has('href')), true);
  assert.equal(container.children[0].children.some((child) => child.textContent === 'password' && !child.attributes.has('href')), true);
});
