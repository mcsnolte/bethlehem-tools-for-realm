import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {globals, query} from './helpers.mjs';
import {openRealmResults} from '../bridge.mjs';

// Run actual panel event handlers with a minimal DOM and Chrome API.
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
  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  add(option) { this.children.push(option); }
}

let panelNumber = 0;
async function panel(t, response = async () => [{result: {ok: true}}], search = '?tab=123') {
  const html = readFileSync(new URL('../panel.html', import.meta.url), 'utf8');
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(match => [match[1], new Element()]));
  const get = id => {
    assert.ok(elements.has(id), `Missing UI element: ${id}`);
    return elements.get(id);
  };
  get('names').value = 'Morgan Example';
  get('separator').value = 'auto';
  get('name-mode').value = 'split';
  get('include-preferred').checked = /<input\b[^>]*id="include-preferred"[^>]*\bchecked\b/.test(html);
  const calls = [];
  globals(t, {
    location: {search},
    document: {
      getElementById: get,
      createElement: () => {
        const element = new Element();
        Object.defineProperty(element, 'id', {set(id) { elements.set(id, element); }});
        return element;
      },
      querySelector: () => new Element(),
      querySelectorAll: () => [get('has-header'), get('back-menu')],
    },
    Option: class extends Element {
      constructor(label, value) { super(); this.textContent = label; this.value = value; }
    },
    chrome: {
      runtime: {getManifest: () => ({version_name: 'test'})},
      scripting: {executeScript: async options => { calls.push(options); return response(); }},
    },
  });
  await import(`../panel.mjs?test=${++panelNumber}`);
  return {get, calls, elements};
}

test('one click hands the original name query to Realm with no review or save UI', async t => {
  const {get, calls, elements} = await panel(t);
  await get('open-results').onclick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].func, openRealmResults);
  assert.deepEqual(calls[0].target, {tabId: 123});
  assert.deepEqual(calls[0].args, [query()]);
  for (const id of ['review', 'rows', 'save', 'report', 'preview']) assert.equal(elements.has(id), false);
  assert.equal(get('open-results').disabled, false);
  assert.match(get('status').textContent, /Results requested/);
});

test('header mapping sends only mapped names', async t => {
  const {get, calls} = await panel(t);
  get('names').value = 'First,Last,Email\nMorgan,Example,fictional@example.invalid';
  get('has-header').checked = true;
  get('map-given').value = '0';
  get('map-family').value = '1';
  await get('open-results').onclick();
  assert.deepEqual(calls[0].args, [query()]);
});

test('invalid input never calls Realm', async t => {
  const {get, calls} = await panel(t);
  get('names').value = '';
  await get('open-results').onclick();
  assert.equal(calls.length, 0);
  assert.match(get('status').textContent, /at least one name/);
});

for (const scenario of ['validation error', 'transport failure', 'missing response']) {
  test(`${scenario} leaves the panel usable for retry`, async t => {
    let attempt = 0;
    const {get, calls} = await panel(t, async () => {
      if (++attempt > 1) return [{result: {ok: true}}];
      if (scenario === 'transport failure') throw Error('Tab unavailable');
      if (scenario === 'missing response') return [];
      return [{result: {ok: false, error: 'Validation failed'}}];
    });
    await get('open-results').onclick();
    assert.equal(get('open-results').disabled, false);
    await get('open-results').onclick();
    assert.equal(calls.length, 2);
  });
}

test('no Realm tab prevents submission', async t => {
  const {get, calls} = await panel(t, undefined, '');
  assert.equal(get('open-results').disabled, true);
  await get('open-results').onclick();
  assert.equal(calls.length, 0);
});

test('busy handoff prevents duplicate clicks', async t => {
  let finish;
  const {get, calls} = await panel(t, () => new Promise(resolve => { finish = resolve; }));
  const opening = get('open-results').onclick();
  assert.equal(get('names').disabled, true);
  assert.equal(get('include-preferred').disabled, true);
  assert.equal(get('open-results').disabled, true);
  await get('open-results').onclick();
  assert.equal(calls.length, 1);
  finish([{result: {ok: true}}]);
  await opening;
  assert.equal(get('names').disabled, false);
  assert.equal(get('include-preferred').disabled, false);
});

test('file read blocks submission until the new contents are ready', async t => {
  const {get, calls} = await panel(t);
  let finishRead;
  get('file').files = [{name: 'names.txt', size: 30, text: () => new Promise(resolve => { finishRead = resolve; })}];
  const reading = get('file').onchange();
  assert.equal(get('names').value, '');
  assert.equal(get('open-results').disabled, true);
  await get('open-results').onclick();
  assert.equal(calls.length, 0);
  finishRead('Morgan Example');
  await reading;
  await get('open-results').onclick();
  assert.deepEqual(calls[0].args, [query()]);
});

for (const scenario of ['read error', 'oversized file']) {
  test(`${scenario} cannot submit the previous list`, async t => {
    const {get, calls} = await panel(t);
    get('file').files = [{name: 'names.csv', size: scenario === 'oversized file' ? 100001 : 10,
      text: async () => { throw Error('Unable to read file'); }}];
    await get('file').onchange();
    await get('open-results').onclick();
    assert.equal(calls.length, 0);
  });
}

for (const mapped of [false, true]) {
  test(`preferred-name toggle controls ${mapped ? 'mapped' : 'plain'} query filters`, async t => {
    const {get, calls} = await panel(t);
    assert.equal(get('include-preferred').checked, true);
    if (mapped) {
      get('names').value = 'First,Last\nMorgan,Example';
      get('has-header').checked = true;
      get('map-given').value = '0';
      get('map-family').value = '1';
    }
    get('include-preferred').checked = false;
    await get('open-results').onclick();
    assert.deepEqual(calls[0].args[0].Query.map(group => group.map(c => c.Name)), [['LastName', 'FirstName']]);
    assert.deepEqual(calls[0].args[0].DisplayColumns, ['LastName0', 'FirstName0']);
    get('include-preferred').checked = true;
    await get('open-results').onclick();
    assert.deepEqual(calls[1].args, [query()]);
  });
}

test('specific field mapping hands email and city conditions to Realm', async t => {
  const {get, calls} = await panel(t);
  get('names').value = 'Email,City\na@example.invalid,Germantown';
  get('has-header').checked = true;
  get('has-header').onchange();
  get('match-mode').value = 'fields';
  get('match-mode').onchange();
  assert.equal(get('field-Email').value, '0');
  assert.equal(get('field-AddressCity').value, '1');
  get('field-AddressCity').onchange();
  assert.equal(get('text-fields').hidden, false);
  get('match-mode').onchange();
  assert.equal(get('field-Email').value, '0');
  assert.equal(get('name-mapping').hidden, true);
  await get('open-results').onclick();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args[0].DisplayColumns, ['Email0', 'AddressCity0']);
  assert.deepEqual(calls[0].args[0].Query[0].map(c => c.Name), ['Email', 'AddressCity']);
});
