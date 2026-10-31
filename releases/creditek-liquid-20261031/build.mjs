import {readFile} from 'node:fs/promises';
export function stripOverlayImport(source){
 const expected="import {applyLiquidHtml,isAuraPresentationPath} from './presentation.mjs';\n";
 if(!source.startsWith(expected))throw Error('Overlay import contract changed; review the builder');
 const body=source.slice(expected.length);
 if(/^\s*import\b/m.test(body))throw Error('Additional overlay imports require builder review');
 return body;
}
export function stripReviewedExports(source,declarations){
 let result=source;
 for(const declaration of declarations){
  const pattern=new RegExp('^export '+declaration+'(?=[( =])','gm');
  if((source.match(pattern)||[]).length!==1)throw Error('Reviewed export contract changed: '+declaration);
  result=result.replace(pattern,declaration);
 }
 if(/^export\b/m.test(result))throw Error('Additional export text requires builder review');
 return result;
}
// Preserve the active entry module; only add the reviewed presentation delegate.
export async function visualEntry(legacyModule){
 if(typeof legacyModule!=='string'||!/^(?:\.\/)?[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.(?:js|mjs)$/.test(legacyModule)||legacyModule.includes('..'))throw Error('Invalid entry module');
 const policy=await readFile(new URL('./presentation.mjs',import.meta.url),'utf8');
 const overlay=stripOverlayImport(await readFile(new URL('./overlay.mjs',import.meta.url),'utf8'));
 const css=await readFile(new URL('../../design-system/components/creditek-liquid.css',import.meta.url),'utf8');
 const policyBody=stripReviewedExports(policy,['const LIQUID_MARKER','const STATIC_LIQUID_LINK','const LIQUID_LINK','function applyLiquidHtml','function isAuraPresentationPath']);
 const overlayBody=stripReviewedExports(overlay,['function auraLiquidOverlay']);
 return 'import legacy from '+JSON.stringify('./'+legacyModule.replace(/^\.\//,''))+';\n'+policyBody+'\n'+overlayBody+'\nconst visualCss='+JSON.stringify(css)+';\nexport default auraLiquidOverlay(legacy,visualCss);\n';
}
