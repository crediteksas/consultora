import legacy from './baseline/tools-entry.mjs';
import { organicOverlay } from '../../src/aura-organic-overlay.mjs';
import html from '../../creditek/agentes/aura-organic-studio.html';
import css from '../../creditek/agentes/aura-organic-studio.css';
import js from '../../creditek/agentes/aura-organic-studio.mjs';
export default organicOverlay(legacy, {
  '/creditek/agentes/aura-organic-studio.html': { body: html, type: 'text/html; charset=utf-8' },
  '/creditek/agentes/aura-organic-studio.css': { body: css, type: 'text/css; charset=utf-8' },
  '/creditek/agentes/aura-organic-studio.mjs': { body: js, type: 'application/javascript; charset=utf-8' },
});
