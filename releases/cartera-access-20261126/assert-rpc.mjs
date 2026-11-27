import assert from'node:assert/strict';
export async function denied(promise,pattern){
 const response=await promise;
 const data=response?.rows?Object.values(response.rows[0]||{})[0]:response;
 assert.ok(data?.__cartera_error,'RPC must return a committed denial envelope, never an empty result');
 assert.match(data.__cartera_error.message,pattern);assert.equal(typeof data.__cartera_error.code,'string');
 return data.__cartera_error;
}
