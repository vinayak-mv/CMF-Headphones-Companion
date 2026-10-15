import test from 'node:test';
import assert from 'node:assert/strict';
import { filterDb, responseDb } from '../ui/response.mjs';

test('zero-gain filters stay flat across the spectrum',()=>{
  for(const kind of ['PK','LS','HS'])for(const frequency of [20,100,1000,10000,20000]){
    assert.ok(Math.abs(filterDb({kind,frequency:1000,gain:0,q:1},frequency))<1e-7);
  }
});
test('peak centre equals gain and preamp is additive',()=>{
  const filter={kind:'PK',frequency:1000,gain:-6,q:1};
  assert.ok(Math.abs(filterDb(filter,1000)+6)<1e-7);
  assert.ok(Math.abs(responseDb([filter],-6.1,1000)+12.1)<1e-7);
});
test('shelves approach their expected low and high limits',()=>{
  const low={kind:'LS',frequency:1000,gain:6,q:.707};
  const high={...low,kind:'HS'};
  assert.ok(Math.abs(filterDb(low,20)-6)<.01);
  assert.ok(Math.abs(filterDb(low,20000))<.01);
  assert.ok(Math.abs(filterDb(high,20))<.01);
  assert.ok(Math.abs(filterDb(high,20000)-6)<.01);
});
test('invalid values cannot generate a misleading curve',()=>{
  assert.ok(Number.isNaN(filterDb({kind:'PK',frequency:0,gain:0,q:1},1000)));
  assert.ok(Number.isNaN(filterDb({kind:'PK',frequency:1000,gain:0,q:0},1000)));
});
