# Authoring reference

A single page for authors and developers that documents the site's blocks, block variants, section styles, spacing utilities, Bootstrap helpers, design tokens and rules.

- Page: `tools/authoring-reference/index.html`
- Preview: `https://<branch>--edspoc-stg--aemedsap.aem.page/tools/authoring-reference/index.html`
- Blocks section: `#blocks`

## Files

| File | What it is | Edited by |
| --- | --- | --- |
| `index.html` | The page (markup, styles, script) | By hand |
| `blocks.json` | Generated inventory of every block under `eds/blocks` and its variants | `npm run reference:build` (do not edit by hand) |
| `build-blocks.mjs` | Scanner that generates `blocks.json` | By hand, only to change how scanning works |

## How the Blocks section works

1. `blocks.json` supplies the block count, descriptions and variants. It is read in the browser from the preview site, so it must be committed and pushed.
2. The page fetches `/query-index.json`, then each page's `.plain.html`, to find which pages use which block. Results are cached in your browser tab session (sessionStorage), so open a new tab to rescan.
3. "Preview this block" opens a slide-in panel on the right showing a live instance of the block from a real page, with prev/next instance, desktop/mobile and zoom controls.

## When you add or change a block

1. Create or edit `eds/blocks/<name>/<name>.css` and `<name>.js`.
   - Put a one-line doc comment at the top of the JS file (`/** ... */`). It becomes the description.
   - Write variants as `.<name>.<variant>` in CSS, or read them in JS with `block.classList.contains('<variant>')`.
2. From the repo root run:
   ```
   npm run reference:build
   ```
3. Check it:
   ```
   npm run reference:check
   ```
   It should print `blocks.json is up to date`.
4. Commit `blocks.json` together with the block, and push.
5. Reload the preview page. The new block appears; it shows as "unused" until a page uses it.

If you skip step 2 or 4, the block is missing from the page even though the code is merged.

## How variants are detected

- CSS: selectors of the form `.<block>.<variant>`.
- JS: `block.classList.contains('<variant>')`.
- Ignored: classes the JS adds itself, names equal to the block, names starting `<block>-`, and names ending `-container` or `-wrapper`.

If a variant is missing, check that it is spelled one of these two ways.

## Things that are not automatic yet

The section styles, utilities, Bootstrap, tokens and rules tables are hand-written HTML in `index.html`. When you add a new utility class, section style or policy (for example in `eds/styles/`), add a row to the matching table in `index.html` by hand.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| New block not on the page | `blocks.json` not rebuilt, committed or pushed. Run build, commit, push, hard-refresh. |
| `reference:check` fails | `blocks.json` is stale. Run `npm run reference:build` and commit it. |
| Variant missing | Not written as `.<block>.<variant>` in CSS or `classList.contains` in JS. |
| Usage numbers look old | Cached per browser tab session. Open a new tab (or clear sessionStorage) to rescan. |
| "Used on pages but no matching block" | A page uses a class with no folder under `eds/blocks` (alias or typo). Fix the page or add the block. |
| 404 on the page | Use the full path ending in `/index.html`; the folder URL is not mapped. |
