import test from 'node:test';
import assert from 'node:assert/strict';
import {diverseSignals} from '../src/v3/signal-selection.ts';
const signal=(id:string,publisher:string)=>({id,payload:JSON.stringify({sources:[{publisher}]})});
const countries=new Map([['large','US'],['small','US'],['local','KE'],['nordic','NO']]);
test('large news flows cannot displace single-source countries',()=>{
 const backlog=[...Array.from({length:100},(_,i)=>signal(String(i),'large')),signal('Kenya','local'),signal('Norway','nordic')];
 const selected=diverseSignals(backlog,countries,0,3);
 assert.equal(selected.length,3);
 assert.ok(selected.some(x=>x.id==='Kenya'));
 assert.ok(selected.some(x=>x.id==='Norway'));
});
test('publishers alternate within the same country',()=>{
 const backlog=[signal('a','large'),signal('b','large'),signal('c','small')];
 assert.deepEqual(diverseSignals(backlog,countries,0,3).map(x=>x.id),['a','c','b']);
});
test('starting country rotates and no signal is selected twice',()=>{
 const backlog=[signal('a','large'),signal('b','local'),signal('c','nordic')];
 const firsts=[0,1,2].map(epoch=>diverseSignals(backlog,countries,epoch,1)[0].id);
 assert.equal(new Set(firsts).size,3);
 assert.equal(diverseSignals(backlog,countries,0,12).length,3);
 assert.deepEqual(diverseSignals([],countries,0),[]);
});
