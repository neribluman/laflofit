import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      /**
       * Reading a `const` declared further down the file is a crash, not a
       * warning: it throws "Cannot access X before initialization" the first
       * time the page renders. TypeScript does not catch it across a closure
       * and `next build` compiles it happily — a crew page shipped broken
       * because a query was fetched below the list that read it.
       */
      "no-use-before-define": "off",
      "@typescript-eslint/no-use-before-define": [
        "error",
        // Functions hoist, types are erased; only values are the hazard.
        { functions: false, classes: false, variables: true, typedefs: false, enums: true },
      ],
    },
  },
]);

export default eslintConfig;
