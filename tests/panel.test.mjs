import test from 'node:test';
import assert from 'node:assert/strict';
import {globals, grid, reportId} from './helpers.mjs';

// Minimal DOM surface for testing actual panel event handlers without a browser.
// Browser rendering and Chrome permissions still need extension smoke testing.
class Element {
  value = '';
  textContent = '';
  hidden = false;
  disabled = false;
  checked = false;
  children = [];
  files = [];
  listeners = new Map();
  classList = {toggle() {}};
  addEventListener(event, callback) { this.listeners.set(event, callback); }
  setAttribute() {}
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  add(option) { this.children.push(option); }
}

let panelNumber = 0;
async function panel(t, saveResponse) {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  get('names').value = 'Morgan Example';
  get('report').value = 'Synthetic report';
  get('separator').value = 'auto';
  get('name-mode').value = 'split';
  get('review').hidden = true;
  get('result').hidden = true;
  const calls = [];
  globals(t, {
    location: {search: '?tab=123'},
    document: {
      getElementById: get,
      createElement: () => new Element(),
      querySelector: () => get('file-label'),
      querySelectorAll: () => [get('has-header'), get('back-menu')],
    },
    Option: class extends Element {
      constructor(label, value) { super(); this.textContent = label; this.value = value; }
    },
    chrome: {
      runtime: {getManifest: () => ({version_name: 'test'})},
      scripting: {
        executeScript: async ({args: [operation, payload]}) => {
          calls.push({operation, payload});
          if (operation === 'preview') return [{result: {ok: true, data: grid(payload)}}];
          return saveResponse(calls);
        },
      },
    },
  });
  await import(`../panel.mjs?test=${++panelNumber}`);
  await get('preview').onclick();
  assert.equal(get('save').disabled, false);
  return {get, calls};
}

for (const message of ['That report name already exists. Choose another name.', 'Realm reported validation errors. Nothing was saved.']) {
  test(`panel allows retry after ${message}`, async t => {
    let attempt = 0;
    const {get, calls} = await panel(t, () => [{result: ++attempt === 1
      ? {ok: false, error: message}
      : {ok: true, id: reportId}}]);
    await get('save').onclick();
    assert.equal(get('preview').disabled, false);
    assert.equal(get('save').disabled, false);
    assert.equal(get('status').textContent, message);
    get('report').value = 'Corrected report';
    await get('save').onclick();
    assert.equal(get('result').hidden, false);
    assert.ok(get('result').href.endsWith(reportId));
    assert.equal(calls.filter(c => c.operation === 'save').length, 2);
  });
}

for (const scenario of ['bridge uncertainty', 'transport rejection', 'missing response']) {
  test(`panel blocks retry after ${scenario}`, async t => {
    const {get, calls} = await panel(t, () => {
      if (scenario === 'transport rejection') throw Error('Realm tab closed');
      if (scenario === 'missing response') return [];
      return [{result: {ok: false, uncertain: true, error: 'Save outcome uncertain.'}}];
    });
    await get('save').onclick();
    assert.equal(get('save').disabled, true);
    assert.equal(get('preview').disabled, true);
    assert.match(get('status').textContent, /Check My Saved Reports/);
    await get('save').onclick();
    await get('preview').onclick();
    assert.equal(calls.filter(c => c.operation === 'save').length, 1);
  });
}

test('malformed replacement file clears the previous review before parsing', async t => {
  const {get, calls} = await panel(t, () => { throw Error('Must not save'); });
  get('file').files = [{name: 'bad.csv', size: 30, text: async () => 'Name\n"unclosed'}];
  await get('file').onchange();
  assert.equal(get('review').hidden, true);
  assert.equal(get('save').disabled, true);
  assert.match(get('status').textContent, /unclosed/);
  await get('save').onclick();
  assert.equal(calls.some(c => c.operation === 'save'), false);
});

test('file read blocks actions and invalidates the old selection immediately', async t => {
  const {get, calls} = await panel(t, () => { throw Error('Must not save'); });
  let finishRead;
  get('file').files = [{name: 'names.txt', size: 30, text: () => new Promise(resolve => { finishRead = resolve; })}];
  const reading = get('file').onchange();
  assert.equal(get('review').hidden, true);
  assert.equal(get('save').disabled, true);
  assert.equal(get('preview').disabled, true);
  assert.equal(get('names').disabled, true);
  await get('preview').onclick();
  assert.equal(calls.length, 1);
  finishRead('Taylor Sample');
  await reading;
  assert.equal(get('names').value, 'Taylor Sample');
  assert.equal(get('preview').disabled, false);
  assert.equal(get('save').disabled, true);
});

for (const scenario of ['read error', 'oversized file']) {
  test(`${scenario} invalidates the previous review`, async t => {
    const {get} = await panel(t, () => { throw Error('Must not save'); });
    get('file').files = [{name: 'names.csv', size: scenario === 'oversized file' ? 100001 : 10,
      text: async () => { throw Error('Unable to read file'); }}];
    await get('file').onchange();
    assert.equal(get('review').hidden, true);
    assert.equal(get('save').disabled, true);
    assert.equal(get('preview').disabled, false);
  });
}
