/**
 * Build the two single-file variants of the game.
 *
 *   dist/bulls-and-cows.html   the whole game in one file: open it, play it,
 *                              mail it to someone. No server, no imports.
 *   dist/artifact.html         the same page for claude.ai/artifact, which
 *                              supplies its own document skeleton and pads
 *                              :root by the phone's safe-area insets.
 *
 * Every rewrite below declares how many times it must match. A miss fails the
 * build instead of quietly shipping a page with a rule half applied.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFile(join(root, p), 'utf8');

/** One rewrite, with the match count it has to see. */
function replace(text, old, next, label, want = 1) {
  const n = text.split(old).length - 1;
  if (n !== want) throw new Error(`${label}: matched ${n} time(s), expected ${want}`);
  return text.split(old).join(next);
}

/* ── the bundle ──────────────────────────────────────────────────── */

/**
 * Flatten the modules into one script. They share a scope once concatenated,
 * so the imports come out and the exports lose their keyword; load order is
 * the dependency order, engine first.
 */
async function bundleScript() {
  const parts = [];
  for (const name of ['engine.js', 'session.js', 'app.js']) {
    const src = (await read(`src/${name}`))
      .replace(/^import\s[^;]*?from\s*'\.\/[^']+';\n/gms, '')
      .replace(/^export (?=const |function |let )/gm, '')
      .trim();
    if (/^\s*(import|export)\s/m.test(src)) throw new Error(`${name}: an import or export survived`);
    parts.push(`/* ── ${name} ${'─'.repeat(Math.max(0, 58 - name.length))} */\n\n${src}`);
  }
  return parts.join('\n\n');
}

async function bundle() {
  let page = await read('index.html');
  const css = (await read('src/styles.css')).trim();
  const js = await bundleScript();

  page = replace(page, '<link rel="stylesheet" href="src/styles.css">',
    `<style>\n${css}\n</style>`, 'stylesheet');
  page = replace(page, '<script type="module" src="src/app.js"></script>',
    `<script>\n(() => {\n'use strict';\n\n${js}\n})();\n</script>`, 'script');
  return page;
}

/* ── the artifact variant ────────────────────────────────────────── */

function toArtifact(src) {
  // the platform provides the document skeleton
  src = replace(src, `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Bulls &amp; Cows</title>
<meta name="description" content="Crack a four-digit code. Every digit is different.">
<meta name="color-scheme" content="light">
<link rel="preconnect"`, `<title>Bulls &amp; Cows</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect"`, 'head');
  src = replace(src, '</head>\n<body>\n', '', 'body open');
  src = replace(src, '</body>\n</html>\n', '', 'body close');

  // the gutter clears a side system bar, and never drops below 16px
  src = replace(src, '  --gut: 18px;',
    '  --gut: 18px;\n'
    + '  --gut-l: max(var(--gut), env(safe-area-inset-left, 0px));\n'
    + '  --gut-r: max(var(--gut), env(safe-area-inset-right, 0px));', 'gutter tokens');
  src = replace(src, '  :root { --gut: 12px; }', '  :root { --gut: 16px; }', 'narrow gutter');

  for (const [old, next, label] of [
    ['  padding: 12px var(--gut) 10px;\n  border-bottom: 1px solid var(--line);',
     '  padding-block: 12px 10px;\n  padding-inline: var(--gut-l) var(--gut-r);\n  border-bottom: 1px solid var(--line);', 'top'],
    ['  padding: 0 var(--gut);\n  display: flex;',
     '  padding-inline: var(--gut-l) var(--gut-r);\n  display: flex;', 'feed'],
    ['  padding: 9px var(--gut);',
     '  padding-block: 9px;\n  padding-inline: var(--gut-l) var(--gut-r);', 'legend'],
    ['  padding: 12px var(--gut) calc(14px + env(safe-area-inset-bottom));',
     '  padding-block: 12px 14px;\n  padding-inline: var(--gut-l) var(--gut-r);', 'board'],
  ]) src = replace(src, old, next, label);

  // one screen sized to 100%, so it fits inside the :root padding
  src = replace(src, '  height: 100vh;\n  height: 100dvh;\n  max-width: 460px;',
    '  height: 100%;\n  max-width: 460px;', 'app height');
  src = replace(src, 'body {\n  margin: 0;\n  background: var(--paper);',
    'html, body { height: 100%; }\n\nbody {\n  margin: 0;\n  background: var(--paper);', 'html height');

  // the overlay covers the insets, its panel stays clear of them
  src = replace(src, '  place-items: center;\n  padding: 16px;\n  animation: fadein .18s ease-out;',
    '  place-items: center;\n  padding:\n'
    + '    max(16px, env(safe-area-inset-top, 0px))\n'
    + '    max(16px, env(safe-area-inset-right, 0px))\n'
    + '    max(16px, env(safe-area-inset-bottom, 0px))\n'
    + '    max(16px, env(safe-area-inset-left, 0px));\n'
    + '  animation: fadein .18s ease-out;', 'scrim insets');
  src = replace(src, '  max-height: calc(100dvh - 32px);', '  max-height: 100%;', 'panel height');
  return src;
}

/* ── run ─────────────────────────────────────────────────────────── */

const single = await bundle();
await mkdir(join(root, 'dist'), { recursive: true });
await writeFile(join(root, 'dist/bulls-and-cows.html'), single);
const artifact = toArtifact(single);
await writeFile(join(root, 'dist/artifact.html'), artifact);
console.log('dist/bulls-and-cows.html  %d bytes', Buffer.byteLength(single));
console.log('dist/artifact.html        %d bytes', Buffer.byteLength(artifact));
