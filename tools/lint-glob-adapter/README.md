# Development glob compatibility contract

This private adapter replaces only the `fast-glob` dependency consumed by
`@next/eslint-plugin-next`'s `get-root-dirs` helper. It uses pinned
`tinyglobby@0.2.17`, removes the vulnerable micromatch/braces implementation,
and leaves the installed Next plugin and all 22 rules/configurations intact.
No lint rule or security gate is disabled.

The used API is `globSync(pattern, { onlyDirectories: true })`. The adapter
disables recursive expansion of literal directories and removes directory
trailing separators, matching the prior helper behavior. Root, braces, missing
paths, spaces and an actual Next anchor violation are checked by
`npm run check:lint-glob`, which is included in quality. Upgrade review must
check for new API use in the plugin before changing its version. Replace this
temporary development adapter when upstream drops or safely replaces that
dependency, with the same contracts tested.

The implementation comes from the maintained
[tinyglobby project](https://github.com/SuperchupuDev/tinyglobby).
It is an actual implementation replacement, not a fabricated patched version
or an audit exception. Production application dependencies are unaffected.
