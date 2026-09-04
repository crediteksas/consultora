import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync('creditek/erp/aliados-liquidaciones.html','utf8');
test('lista alinea títulos con datos y evita partir Operaciones',()=>{
 assert.match(html,/th:nth-child\(5\)\{width:10%;white-space:nowrap!important/);
 assert.match(html,/td:nth-child\(n\+3\):nth-child\(-n\+5\)\{text-align:center!important/);
 assert.match(html,/td:nth-child\(n\+6\):nth-child\(-n\+9\)\{text-align:right!important/);
});
