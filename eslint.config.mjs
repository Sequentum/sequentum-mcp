import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";

// Intentionally minimal: this config is focused on catching the class of bug
// that took prod down (SE4-3428) — a circular import whose top-level binding
// access throws a temporal-dead-zone ReferenceError under native Node ESM.
// `import-x/no-cycle` flags such cycles statically, before runtime.
//
// We extend import-x's official `recommended` + `typescript` flat presets so the
// parser and TypeScript resolver (which maps NodeNext `./foo.js` specifiers to
// their `.ts` sources) are wired the supported way — a hand-rolled resolver
// setting silently failed to let no-cycle walk the graph.
export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "**/*.test.ts"],
  },
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      "import-x/no-cycle": ["error", { ignoreExternal: true }],
      "import-x/no-self-import": "error",
    },
  },
  {
    // The presets enable several import-hygiene rules we don't want to gate on;
    // keep this config tightly scoped to the cycle guard and silence the rest.
    rules: {
      "import-x/no-unresolved": "off",
      "import-x/namespace": "off",
      "import-x/default": "off",
      "import-x/named": "off",
      "import-x/no-named-as-default": "off",
      "import-x/no-named-as-default-member": "off",
    },
  }
);
