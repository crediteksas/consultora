import {readFile,writeFile} from 'node:fs/promises';
import {patchApprovedSofiaUI} from './approved.mjs';
const source=await readFile(new URL('../../backups/aura-sofia-layout-20261028/predecessor.mjs',import.meta.url),'utf8');
const candidate=await patchApprovedSofiaUI(source);
await writeFile('/private/tmp/sofia-visual-ATH0Kd/approved-candidate.mjs',candidate,{mode:0o600});
