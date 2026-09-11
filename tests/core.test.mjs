import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNames,buildQuery,reviewResults,selectionQuery,verifySelection} from '../core.mjs';
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
test('selection distinguishes IDs and rejects missing or unselected people',()=>{
 const names=parseNames('Morgan Example');const q=buildQuery(names);
 const columns=['IndividualId','ContactInfo_Label','ContactInfo_FirstName','ContactInfo_PreferredName','ContactInfo_LastName'].map(Name=>({Name}));
 const d={Settings:{Query:q,Columns:columns},Items:[['one','Morgan Example','Morgan',null,'Example'],['two','Morgan Example','Morgan',null,'Example']],TotalCount:2,HasMore:false};
 const review=reviewResults(d,q,names);assert.equal(review.rows[0].status,'Ambiguous');
 const chosen=new Set(['one']),selected=selectionQuery(review,chosen);assert.deepEqual(selected.Excluded,['two']);
 const ignored={...d,Settings:{...d.Settings,Query:selected}};assert.throws(()=>verifySelection(ignored,selected,chosen));
 assert.equal(verifySelection({...ignored,Items:[d.Items[0]],TotalCount:1},selected,chosen),true);
 assert.throws(()=>reviewResults({...d,HasMore:true},q,names));
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
