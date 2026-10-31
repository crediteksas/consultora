import {readFile} from 'node:fs/promises';
import {setup as parentSetup,original,candidate,form,ids} from '../../nova-sms-activation-20261030/tests/fixture.mjs';
export {original,candidate,form,ids};
export const diagnosticCandidate=await readFile(new URL('../deploy/index.mjs',import.meta.url),'utf8');
export const setup=(options={})=>parentSetup({source:diagnosticCandidate,...options});

