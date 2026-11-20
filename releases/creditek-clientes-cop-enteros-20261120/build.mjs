import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(path.join(repo,'package.json'));
const {transformSync}=require('esbuild');
assert.equal(require('wrangler/package.json').version,'4.114.0','Review again after a toolchain change');
const root=path.resolve(process.argv[2]);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const before=await fs.readFile(path.join(root,'baseline/index.mjs'),'utf8');
assert.equal(sha(before),'51ca18ee0336bc472aa13a685b693f2410bd89a3d94da3d987b833af18fb01c8','Production changed: capture and review again');
const form=await fs.readFile(path.join(root,'baseline/form.html'));
assert.equal(sha(form),'556902d2a0d8c0782e263e53c14670ab85172fb838d5745b82b7bc75317c9d31');
const source=await fs.readFile(path.join(repo,'creditek/workers/creditek-clientes/src/moneda-cop.ts'),'utf8');
const helper=transformSync(source,{loader:'ts',target:'es2022',format:'esm'}).code.replace(/\nexport \{[\s\S]*?\};\s*$/,'');
assert.ok(!helper.includes('export '));
assert.ok(!before.includes('function pesosDesdeCentavos('));
const oldCompact='  const n = BigInt(centavos2), absoluto = n < 0n ? -n : n;\n  return "$" + (n < 0n ? "-" : "") + new Intl.NumberFormat("es-CO").format(absoluto / 100n) + "," + String(absoluto % 100n).padStart(2, "0");';
const oldLegacy='"$" + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(Number(n))';
const edits=[
  ['var moneda = /* @__PURE__ */',helper+'\nvar moneda = /* @__PURE__ */'],
  [oldCompact,'  return pesosDesdeCentavos(centavos2);'],
  [oldLegacy,'pesosReporte(n)'],
];
let candidate=before;
for(const [a,b] of edits){assert.equal(candidate.split(a).length-1,1,'Unexpected formatter shape');candidate=candidate.replace(a,b);}
let inverse=candidate;
for(const [a,b] of [...edits].reverse())inverse=inverse.replace(b,a);
assert.equal(inverse,before,'Changes outside currency formatters');
await fs.mkdir(path.join(root,'candidate'),{recursive:true});
await fs.writeFile(path.join(root,'candidate/index.mjs'),candidate);
await fs.writeFile(path.join(root,'candidate/form.html'),form);
const live=JSON.parse(await fs.readFile(path.join(root,'baseline.json'),'utf8')),settings=live.settings;
const metadata={};
for(const key of ['placement','compatibility_date','compatibility_flags','usage_model','tags','tail_consumers','logpush','observability','limits'])if(settings[key]!==undefined)metadata[key]=settings[key];
// API: list of binding TYPES to retain, applied to multipart by Wrangler unsafe.metadata.
// https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/methods/create/
metadata.keep_bindings=[...new Set(settings.bindings.map(b=>b.type))].sort();
const config={name:'creditek-clientes',main:'./candidate/index.mjs',compatibility_date:settings.compatibility_date,compatibility_flags:settings.compatibility_flags,no_bundle:true,find_additional_modules:true,rules:[{type:'Text',globs:['**/*.html'],fallthrough:true}],keep_vars:true,unsafe:{metadata}};
await fs.writeFile(path.join(root,'wrangler.json'),JSON.stringify(config,null,2));
const manifest={worker:'creditek-clientes',sourceSha256:sha(source),baselineSha256:sha(before),candidateSha256:sha(candidate),unchangedFormSha256:sha(form),baselineVersions:[...live.deployments.deployments].sort((a,b)=>Date.parse(b.created_on)-Date.parse(a.created_on))[0].versions,preservedBindingTypes:metadata.keep_bindings};
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify(manifest));
