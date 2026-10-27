// Development-only compatibility surface used by Next's get-root-dirs helper.
// Keep the actual lint rules intact while removing the vulnerable braces chain.
const { globSync } = require("tinyglobby");

exports.globSync = (patterns, options = {}) => globSync(patterns, {
  ...options,
  // fast-glob does not recursively expand a literal directory argument.
  expandDirectories: false,
}).map((path) => options.onlyDirectories && path !== "/" && !/^[A-Za-z]:\/$/.test(path)
  ? path.replace(/\/$/, "") : path);
