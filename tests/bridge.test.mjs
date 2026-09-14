import test from 'node:test';
import assert from 'node:assert/strict';
import {openRealmResults} from '../bridge.mjs';
import {globals, query} from './helpers.mjs';

const json = data => new Response(JSON.stringify(data), {headers: {'content-type': 'application/json'}});
const html = () => new Response('<html></html>', {headers: {'content-type': 'text/html'}});

function realm(t, replies, {token = 'synthetic-token', fallback = 'fresh-token', submitError = false} = {}) {
  const calls = [];
  const forms = [];
  globals(t, {
    location: {origin: 'https://onrealm.org', pathname: '/BethlehemWELS/Queries/Saved'},
    document: {
      querySelector: () => token ? {value: token} : null,
      body: {append: form => { form.connected = true; forms.push(form); }},
      createElement: tag => tag === 'form' ? {
        children: [],
        append(input) { this.children.push(input); },
        submit() {
          assert.equal(this.connected, true);
          if (submitError) throw Error('Submission failed');
          this.submitted = true;
        },
        remove() { this.connected = false; },
      } : {},
    },
    DOMParser: class {
      parseFromString() { return {querySelector: () => fallback ? {value: fallback} : null}; }
    },
    fetch: async (url, options) => {
      calls.push({endpoint: url.split('/').at(-1), ...options});
      assert.ok(replies.length, 'Unexpected request');
      const reply = replies.shift();
      if (reply instanceof Error) throw reply;
      return reply;
    },
  });
  return {calls, forms};
}

test('valid query navigates through an unsaved native form, without fetching profiles or saving', async t => {
  const {calls, forms} = realm(t, [json([])]);
  assert.deepEqual(await openRealmResults(query()), {ok: true});
  assert.deepEqual(calls.map(c => c.endpoint), ['ValidateQuery']);
  assert.deepEqual(JSON.parse(calls[0].body.get('args')), query());
  assert.equal(forms.length, 1);
  const form = forms[0];
  assert.equal(form.action, 'https://onrealm.org/BethlehemWELS/Queries/Results');
  assert.equal(form.method, 'POST');
  assert.equal(form.target, '_self');
  assert.equal(form.acceptCharset, 'UTF-8');
  assert.equal(form.submitted, true);
  assert.equal(form.connected, true);
  assert.ok(form.children.every(input => input.type === 'hidden'));
  assert.deepEqual(Object.fromEntries(form.children.map(input => [input.name, input.value])), {
    'query-id': '', 'query-type': '', 'query-args': JSON.stringify(query()),
    'query-name': '', 'query-description': '', 'query-initial-data': '',
    'query-selected-tags': '[]', __RequestVerificationToken: 'synthetic-token',
  });
});

test('fallback session token is used for validation and navigation', async t => {
  const {calls, forms} = realm(t, [html(), json([])], {token: null});
  assert.deepEqual(await openRealmResults(query()), {ok: true});
  assert.deepEqual(calls.map(c => c.endpoint), ['Saved', 'ValidateQuery']);
  assert.equal(calls[0].redirect, 'error');
  assert.equal(calls[1].body.get('__RequestVerificationToken'), 'fresh-token');
  assert.equal(forms[0].children.find(input => input.name === '__RequestVerificationToken').value, 'fresh-token');
});

for (const [label, reply, pattern] of [
  ['HTTP failure', () => new Response('', {status: 403}), /ValidateQuery returned HTTP 403/],
  ['validation rejection', () => json(['invalid']), /validation errors/],
  ['unfamiliar validation response', () => json({}), /validation errors/],
  ['expired session', html, /session may have expired/],
  ['network failure', () => new Error('connection lost'), /connection lost/],
]) {
  test(`${label} stops before navigation`, async t => {
    const {forms} = realm(t, [reply()]);
    const result = await openRealmResults(query());
    assert.equal(result.ok, false);
    assert.match(result.error, pattern);
    assert.equal(forms.length, 0);
  });
}

test('missing token stops before validation or navigation', async t => {
  const {calls, forms} = realm(t, [html()], {token: null, fallback: null});
  assert.match((await openRealmResults(query())).error, /session token was not found/);
  assert.equal(calls.length, 1);
  assert.equal(forms.length, 0);
});

test('wrong Realm site is rejected before any request', async t => {
  const {calls, forms} = realm(t, []);
  location.pathname = '/AnotherChurch/Queries/Saved';
  assert.equal((await openRealmResults(query())).ok, false);
  assert.equal(calls.length, 0);
  assert.equal(forms.length, 0);
});

test('submission failure cleans up the temporary form', async t => {
  const {forms} = realm(t, [json([])], {submitError: true});
  assert.match((await openRealmResults(query())).error, /Submission failed/);
  assert.equal(forms[0].connected, false);
});
