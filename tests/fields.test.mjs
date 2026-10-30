import test from 'node:test';
import assert from 'node:assert/strict';
import {mappedConditions, suggestFieldMapping} from '../import.mjs';
import {buildFieldQuery} from '../core.mjs';

test('email and city import reproduces captured Realm conditions and supports alternative rows', () => {
  const imported = mappedConditions('Email,City\na@example.invalid,Germantown\nb@example.invalid,Milwaukee\nA@example.invalid,Germantown', {Email: 0, AddressCity: 1});
  assert.equal(imported.duplicates, 1);
  const query = buildFieldQuery(imported.groups);
  assert.deepEqual(query.DisplayColumns, ['Email0', 'AddressCity0']);
  assert.equal(query.Query.length, 2);
  assert.deepEqual(query.Query[0].map(({Name, Operator, Values, SubQuery, Id}) => ({Name, Operator, Values, SubQuery, Id})), [
    {Name: 'Email', Operator: 0, Values: ['A@example.invalid'], SubQuery: [], Id: 'Email0'},
    {Name: 'AddressCity', Operator: 0, Values: ['Germantown'], SubQuery: [], Id: 'AddressCity0'},
  ]);
  assert.equal(new Set(query.Query.flat().map(c => c.Id)).size, 4);
  assert.equal(query.OrderBy, null);
});

test('incomplete rows and unsupported fields cannot silently broaden a query', () => {
  assert.throws(() => mappedConditions('Email,City\na@example.invalid,', {Email: 0, AddressCity: 1}), /blank/);
  assert.throws(() => mappedConditions('Email\na@example.invalid', {}), /at least one/);
  assert.throws(() => mappedConditions('State\nWI', {AddressState: 0}), /valid field/);
  assert.throws(() => mappedConditions('Email,City\na@example.invalid', {Email: 0}), /column count/);
  assert.throws(() => mappedConditions('Email\na@example.invalid', {Email: 0, AddressCity: 0}), /different column/);
});

test('text imports preserve postal zeroes and enforce distinct row limit', () => {
  assert.equal(mappedConditions('ZIP\n00501', {AddressPostalCode: 0}).groups[0][0].value, '00501');
  assert.throws(() => mappedConditions('City\n' + Array.from({length: 51}, (_, i) => 'City' + i).join('\n'), {AddressCity: 0}), /50/);
});

test('forms full name splits and retains email in both preferred-name alternatives', () => {
  const imported = mappedConditions('Submitted,Name,Email,Working,More\n10/30/2026,Morgan Example,morgan@example.invalid,Yes,ok', {FullName: 1, Email: 2});
  const query = buildFieldQuery(imported.groups);
  assert.deepEqual(query.Query.map(group => group.map(c => [c.Name, c.Values[0]])), [
    [['LastName', 'Example'], ['FirstName', 'Morgan'], ['Email', 'morgan@example.invalid']],
    [['LastName', 'Example'], ['PreferredName', 'Morgan'], ['Email', 'morgan@example.invalid']],
  ]);
  assert.equal(buildFieldQuery(imported.groups, {includePreferredName: false}).Query.length, 1);
  assert.ok(!JSON.stringify(query).includes('FullName'));
  assert.throws(() => mappedConditions('Name\nMorgan Lee Example', {FullName: 0}), /compound names/);
  assert.throws(() => mappedConditions('Name,First\nMorgan Example,Morgan', {FullName: 0, FirstName: 1}), /rather than both/);
  const compound = mappedConditions('Name\n"van Example, Morgan Lee"', {FullName: 0});
  assert.equal(compound.groups[0][0].value, 'van Example');
});

test('matching headers auto-map form names and supported text fields', () => {
  const mapping = suggestFieldMapping(['Submitted', 'Name', 'Email', 'Is this working?', 'Tell us more.']);
  assert.equal(mapping.FullName, 1);
  assert.equal(mapping.Email, 2);
  assert.equal(Object.values(mapping).filter(i => i >= 0).length, 2);
  const fields = suggestFieldMapping([' first_name ', 'LAST-NAME', 'AddressCity', 'ZIP', 'Phone']);
  assert.equal(fields.FirstName, 0);
  assert.equal(fields.LastName, 1);
  assert.equal(fields.AddressCity, 2);
  assert.equal(fields.AddressPostalCode, 3);
  assert.equal(fields.PhoneNumber, 4);
  assert.equal(suggestFieldMapping(['Email', 'email']).Email, -1);
  assert.equal(suggestFieldMapping(['Name', 'First Name', 'Last Name']).FullName, -1);
});
