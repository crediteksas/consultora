import {readFile,writeFile} from 'node:fs/promises';import {patchSofiaVisual} from './patch.mjs';
const source=await readFile(new URL('../../backups/aura-sofia-layout-20261028/predecessor.mjs',import.meta.url),'utf8');
await writeFile('/private/tmp/sofia-visual-ATH0Kd/candidate.mjs',await patchSofiaVisual(source),{mode:0o600});
