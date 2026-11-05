import assert from 'node:assert/strict';
export function validateRetainedBindings(metadata,expected){
 assert.ok(Array.isArray(expected),'Missing independent binding baseline');
 assert.ok(Array.isArray(metadata.keep_bindings),'Missing keep_bindings');
 for(const list of [expected,metadata.keep_bindings]){assert.ok(list.every(x=>typeof x==='string'&&x.length>0),'Invalid binding type');assert.equal(new Set(list).size,list.length,'Duplicate binding type');}
 assert.deepEqual([...metadata.keep_bindings].sort(),[...expected].sort(),'Binding preservation mismatch');
}
