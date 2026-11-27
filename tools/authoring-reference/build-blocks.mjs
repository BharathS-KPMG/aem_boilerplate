/*
 * Builds tools/authoring-reference/blocks.json from the code in eds/blocks.
 *
 *   npm run reference:build   rewrites blocks.json
 *   npm run reference:check   exits with an error when blocks.json is out of date
 *
 * Every folder in eds/blocks is one block. Variants are the extra classes a block
 * reacts to: `.block.variant` selectors in its CSS plus `classList.contains('x')`
 * checks on the block in its JS, minus classes the block adds to itself while decorating
 * (those are runtime state, not authoring options).
 * Run this again after adding a block, adding a variant or renaming one, then
 * commit blocks.json. The reference page reads it at load time.
 */
import {
  readdirSync, readFileSync, existsSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const blocksDir = join(here, '..', '..', 'eds', 'blocks');
const out = join(here, 'blocks.json');

const IGNORE = new Set(['block', 'hidden', 'active', 'open', 'loaded', 'selected', 'disabled']);

const read = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '');
const unique = (list) => [...new Set(list)];
const matches = (text, re, group = 1) => [...text.matchAll(re)].map((m) => m[group]);

function describe(js, name) {
  const doc = js.match(/\/\*\*?([\s\S]*?)\*\//);
  if (!doc) return '';
  const first = doc[1]
    .split('\n')
    .map((l) => l.replace(/^\s*\*?\s?/, '').trim())
    .find((l) => /[a-z]{3}/i.test(l) && !/^(\*|=|@|\/|https?:|authoring|variant:|block name:|row \d|col \d|each row)/i.test(l));
  return (first || '').replace(new RegExp(`^${name}\\s*[-\u2013\u2014:]+\\s*`, 'i'), '');
}

const blocks = readdirSync(blocksDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()
  .map((name) => {
    const jsFile = join(blocksDir, name, `${name}.js`);
    const cssFile = join(blocksDir, name, `${name}.css`);
    const js = read(jsFile);
    const css = read(cssFile).replace(/\/\*[\s\S]*?\*\//g, '');
    const escaped = name.replace(/[-]/g, '\\-');

    const fromCss = matches(css, new RegExp(`\\.${escaped}\\.([a-z][a-z0-9_-]*)`, 'g'));
    const fromJs = matches(js, /block\.classList\.contains\(\s*['"]([a-z][a-z0-9_-]*)['"]\s*\)/g);
    const added = matches(js, /classList\.(?:add|toggle)\(\s*['"]([a-z][a-z0-9_-]*)['"]/g);

    const variants = unique([...fromCss, ...fromJs])
      .filter((v) => v !== name && !IGNORE.has(v) && !added.includes(v))
      .filter((v) => !v.startsWith(`${name}-`) && !/-(container|wrapper)$/.test(v))
      .sort()
      .map((v) => ({
        name: v,
        css: fromCss.includes(v),
        js: fromJs.includes(v),
      }));

    return {
      name,
      description: describe(js, name),
      js: existsSync(jsFile),
      css: existsSync(cssFile),
      variants,
    };
  });

const data = { count: blocks.length, blocks };
const text = `${JSON.stringify(data, null, 2)}\n`;

if (process.argv.includes('--check')) {
  if (read(out) !== text) {
    // eslint-disable-next-line no-console
    console.error('blocks.json is out of date. Run: npm run reference:build');
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log(`blocks.json is up to date (${blocks.length} blocks).`);
} else {
  writeFileSync(out, text);
  // eslint-disable-next-line no-console
  console.log(`${blocks.length} blocks, ${blocks.reduce((n, b) => n + b.variants.length, 0)} variants -> ${out}`);
}
