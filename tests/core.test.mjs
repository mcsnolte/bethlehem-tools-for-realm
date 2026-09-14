import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNames,buildQuery} from '../core.mjs';
import {readTable,mappedNames,suggestMapping} from '../import.mjs';
test('CSV imports support headers, quoting, repeated columns and compound names',()=>{
 assert.deepEqual(readTable('First,Last\r\n"Morgan, Lee",Example'),[['First','Last'],['Morgan, Lee','Example']]);
 assert.equal(suggestMapping(['Label','First Name','Last Name','First Name']).given,1);
 assert.deepEqual(mappedNames('First,Last\nMorgan Lee,van Example',{given:0,family:1}).names,[{given:'Morgan Lee',family:'van Example'}]);
 assert.throws(()=>mappedNames('First,Last\nMorgan',{given:0,family:1}));
 assert.equal(mappedNames('First,Last\nMorgan,Example\nMorgan,Example',{given:0,family:1}).duplicates,1);
});
test('50-name queries have unique condition IDs and deduplicate identical inputs',()=>{
 const names=Array.from({length:50},(_,i)=>({given:'Example'+i,family:'Sample'}));
 const q=buildQuery(names);assert.equal(q.Query.length,100);assert.equal(new Set(q.Query.flat().map(c=>c.Id)).size,200);
 assert.equal(buildQuery([...names,...names]).Query.length,100);
 assert.throws(()=>parseNames(Array(51).fill('Morgan Example').join('\n')));
});
test('full-name cells reject multiple names instead of silently taking the first', () => {
  assert.throws(
    () => mappedNames('Name\n"Morgan Example\nTaylor Sample"', {mode: 'full', full: 0}),
    /Data row 1: use exactly one name per full-name cell/,
  );
  assert.deepEqual(
    mappedNames('Name\n"Example, Morgan"', {mode: 'full', full: 0}).names,
    [{given: 'Morgan', family: 'Example'}],
  );
});

for (const includePreferredName of [false, true]) {
  test(`display columns reference available attributes with preferred matching ${includePreferredName ? 'on' : 'off'}`, () => {
    const query = buildQuery(parseNames('Morgan Example\nTaylor Sample'), {includePreferredName});
    const attributes = new Set(query.Query.flat().map(condition => condition.Id));
    for (const column of query.DisplayColumns) {
      assert.ok(attributes.has(column), `Unknown attribute for display column ${column}`);
    }
    assert.deepEqual(query.DisplayColumns, includePreferredName
      ? ['LastName0', 'FirstName0', 'PreferredName0']
      : ['LastName0', 'FirstName0']);
  });
}
