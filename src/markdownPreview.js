const FENCE_MARKER = '```';

export function renderMarkdownPreview({ document, container, markdown }) {
  const blocks = parseBlocks(String(markdown ?? ''));
  container.replaceChildren(...blocks.map((block) => renderBlock(document, block)));
}

function parseBlocks(markdown) {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === '') {
      index += 1;
      continue;
    }

    if (line.trim() === FENCE_MARKER) {
      const codeLines = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== FENCE_MARKER) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: 'codeBlock', text: codeLines.join('\n') });
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.+)$/u.exec(line);
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, text: headingMatch[2] });
      index += 1;
      continue;
    }

    const listMatch = /^\s*(?:[-*]|\d+[.)])\s+(.+)$/u.exec(line);
    if (listMatch) {
      const ordered = /^\s*\d+[.)]/u.test(line);
      const items = [];
      while (index < lines.length) {
        const currentMatch = /^\s*(?:[-*]|\d+[.)])\s+(.+)$/u.exec(lines[index]);
        const currentOrdered = /^\s*\d+[.)]/u.test(lines[index]);
        if (!currentMatch || currentOrdered !== ordered) break;
        items.push(currentMatch[1]);
        index += 1;
      }
      blocks.push({ type: ordered ? 'orderedList' : 'unorderedList', items });
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() !== '' && lines[index].trim() !== FENCE_MARKER && !/^(#{1,6})\s+.+$/u.test(lines[index]) && !/^\s*(?:[-*]|\d+[.)])\s+.+$/u.test(lines[index])) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraphLines.join(' ') });
  }

  return blocks;
}

function renderBlock(document, block) {
  if (block.type === 'codeBlock') {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = block.text;
    pre.append(code);
    return pre;
  }

  if (block.type === 'heading') {
    const heading = document.createElement(`h${block.level}`);
    appendInlineMarkdown(document, heading, block.text);
    return heading;
  }

  if (block.type === 'unorderedList' || block.type === 'orderedList') {
    const list = document.createElement(block.type === 'orderedList' ? 'ol' : 'ul');
    list.append(...block.items.map((itemText) => {
      const item = document.createElement('li');
      appendInlineMarkdown(document, item, itemText);
      return item;
    }));
    return list;
  }

  const paragraph = document.createElement('p');
  appendInlineMarkdown(document, paragraph, block.text);
  return paragraph;
}

function appendInlineMarkdown(document, parent, text) {
  const pattern = /(\[[^\]]+\]\([^\s)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/gu;
  let cursor = 0;
  const children = [];
  for (const match of text.matchAll(pattern)) {
    if (match.index > cursor) children.push(textSpan(document, text.slice(cursor, match.index)));
    children.push(renderInlineToken(document, match[0]));
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) children.push(textSpan(document, text.slice(cursor)));
  parent.append(...children);
}

function renderInlineToken(document, token) {
  const linkMatch = /^\[([^\]]+)\]\(([^\s)]+)\)$/u.exec(token);
  if (linkMatch) {
    const [, label, rawHref] = linkMatch;
    if (isSafeHttpUrl(rawHref)) {
      const link = document.createElement('a');
      link.textContent = label;
      link.setAttribute('href', rawHref);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
      return link;
    }
    return textSpan(document, label);
  }

  if (token.startsWith('`') && token.endsWith('`')) {
    const code = document.createElement('code');
    code.textContent = token.slice(1, -1);
    return code;
  }

  if (token.startsWith('**') && token.endsWith('**')) {
    const strong = document.createElement('strong');
    strong.textContent = token.slice(2, -2);
    return strong;
  }

  if (token.startsWith('*') && token.endsWith('*')) {
    const emphasis = document.createElement('em');
    emphasis.textContent = token.slice(1, -1);
    return emphasis;
  }

  return textSpan(document, token);
}

function textSpan(document, text) {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
}

function isSafeHttpUrl(rawHref) {
  try {
    const url = new URL(rawHref);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}
