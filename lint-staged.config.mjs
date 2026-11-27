// Pre-commit lint, run by .husky/pre-commit. Checks only the staged files, with the
// same rules and scope as `npm run lint` (which CI runs on every push).
//
// linebreak-style is off here because Windows checkouts (core.autocrlf=true) have
// CRLF on disk while git commits LF. CI checks out on Linux, so the rule is still
// enforced on what actually lands in the repo.
export default {
  '*.{js,mjs,json}': 'eslint --rule "linebreak-style: off"',
  'eds/{blocks/**,styles}/*.css': 'stylelint --allow-empty-input',
};
