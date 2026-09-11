import test from 'node:test';
import assert from 'node:assert/strict';
import {realmRequest} from '../bridge.mjs';
import {globals, grid, query, reportId} from './helpers.mjs';

const json = data => new Response(JSON.stringify(data), {
  headers: {'content-type': 'application/json'},
});
const html = () => new Response('<html></html>', {
  headers: {'content-type': 'text/html'},
});

function realm(t, replies, {token = 'synthetic-token', refreshed = 'fresh-token'} = {}) {
  const calls = [];
  globals(t, {
    location: {origin: 'https://onrealm.org', pathname: '/BethlehemWELS/Queries/Saved'},
    document: {querySelector: () => token ? {value: token} : null},
    DOMParser: class {
      parseFromString() {
        return {querySelector: () => refreshed ? {value: refreshed} : null};
      }
    },
    fetch: async (url, options) => {
      calls.push({endpoint: url.split('/').at(-1), ...options});
      assert.ok(replies.length, 'Unexpected request');
      const reply = replies.shift();
      if (reply instanceof Error) throw reply;
      return reply;
    },
  });
  return calls;
}

const payload = () => ({Name: 'Synthetic report', Query: query(), Tags: []});

test('HTTP failures retain the endpoint and numeric status', async t => {
  realm(t, [new Response('', {status: 403})]);
  assert.deepEqual(await realmRequest('save', payload()), {
    ok: false, error: 'QueryNameInUse returned HTTP 403.',
  });
});

test('duplicate names stop before validation or creation and remain recoverable', async t => {
  const calls = realm(t, [json(true)]);
  const result = await realmRequest('save', payload());
  assert.equal(result.ok, false);
  assert.match(result.error, /already exists/);
  assert.equal(result.uncertain, undefined);
  assert.deepEqual(calls.map(c => c.endpoint), ['QueryNameInUse']);
});

test('validation rejection stops before creation and remains recoverable', async t => {
  const calls = realm(t, [json(false), json(['Invalid query'])]);
  const result = await realmRequest('save', payload());
  assert.equal(result.ok, false);
  assert.match(result.error, /validation errors/);
  assert.equal(result.uncertain, undefined);
  assert.deepEqual(calls.map(c => c.endpoint), ['QueryNameInUse', 'ValidateQuery']);
});

test('successful save validates first and returns the report ID', async t => {
  const calls = realm(t, [json(false), json([]), json(reportId)]);
  assert.deepEqual(await realmRequest('save', payload()), {ok: true, id: reportId});
  assert.deepEqual(calls.map(c => c.endpoint), ['QueryNameInUse', 'ValidateQuery', 'AddSavedQuery']);
  assert.deepEqual(JSON.parse(calls[2].body.get('args')), payload());
  assert.equal(calls[2].body.get('__RequestVerificationToken'), 'synthetic-token');
});

for (const [label, reply] of [
  ['network failure', () => new Error('connection lost')],
  ['unrecognized response', () => json({unexpected: true})],
]) {
  test(`creation ${label} is uncertain and is never retried`, async t => {
    const calls = realm(t, [json(false), json([]), reply()]);
    const result = await realmRequest('save', payload());
    assert.equal(result.ok, false);
    assert.equal(result.uncertain, true);
    assert.equal(calls.filter(c => c.endpoint === 'AddSavedQuery').length, 1);
  });
}

test('expired session returning HTML is a recoverable preflight failure', async t => {
  realm(t, [html()]);
  const result = await realmRequest('save', payload());
  assert.match(result.error, /session may have expired/);
  assert.equal(result.uncertain, undefined);
});

test('missing session token stops before any POST', async t => {
  const response = html();
  Object.defineProperty(response, 'url', {value: 'https://onrealm.org/BethlehemWELS/Queries/Saved'});
  const calls = realm(t, [response], {token: null, refreshed: null});
  const result = await realmRequest('preview', query());
  assert.equal(result.ok, false);
  assert.match(result.error, /session token was not found/);
  assert.deepEqual(calls.map(c => c.endpoint), ['Saved']);
  assert.equal(calls[0].method, undefined);
});

test('preview initializes results, refreshes token, pages, and strips contact columns', async t => {
  const first = grid(query(), ['one']);
  first.HasMore = true;
  const second = grid(query(), ['two']);
  second.TotalCount = 2;
  for (const page of [first, second]) {
    page.Settings.Columns.push({Name: 'ContactInfo_Email'});
    page.Items[0].push('fictional@example.invalid');
  }
  const calls = realm(t, [json([]), html(), json(first), json(second)]);
  const result = await realmRequest('preview', query());
  assert.equal(result.ok, true);
  assert.equal(result.data.Items.length, 2);
  assert.equal(result.data.TotalCount, 2);
  assert.equal(result.data.HasMore, false);
  assert.equal(result.data.Settings.Columns.length, 5);
  assert.equal(JSON.stringify(result).includes('fictional@example.invalid'), false);
  assert.deepEqual(calls.map(c => c.endpoint), ['ValidateQuery', 'Results', 'GetResultsGrid', 'GetResultsGrid']);
  assert.equal(calls[1].body.get('query-id'), '');
  assert.deepEqual(calls.slice(2).map(c => c.body.get('page')), ['0', '1']);
  assert.equal(calls[2].body.get('__RequestVerificationToken'), 'fresh-token');
});

for (const scenario of ['repeated', 'empty', 'changed query', 'changed columns']) {
  test(`preview rejects a ${scenario} subsequent page`, async t => {
    const first = grid();
    first.HasMore = true;
    first.TotalCount = 2;
    const next = grid(query(), scenario === 'repeated' ? ['one'] : scenario === 'empty' ? [] : ['two']);
    next.TotalCount = 2;
    if (scenario === 'changed query') next.Settings.Query.Query = [];
    if (scenario === 'changed columns') next.Settings.Columns[0].Name = 'DifferentId';
    const calls = realm(t, [json([]), html(), json(first), json(next)]);
    const result = await realmRequest('preview', query());
    assert.equal(result.ok, false);
    assert.equal(calls.length, 4);
    assert.equal(calls.some(c => c.endpoint === 'AddSavedQuery'), false);
  });
}
