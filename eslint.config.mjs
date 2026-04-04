import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import ts from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import prettier from "eslint-config-prettier";
import globals from "globals";
import svelteConfig from "./svelte.config.js";

export default defineConfig([
  {
    files: ["**/*.js", "**/*.ts", "**/*.svelte"],
    extends: [
      js.configs.recommended,
      ...ts.configs.strictTypeChecked,
      ...ts.configs.stylisticTypeChecked,
      ...svelte.configs.recommended,
      prettier,
      ...svelte.configs.prettier,
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: ["svelte.config.js"],
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: [".svelte"],
      },
    },
    rules: {
      // disable base rules superseded by ts versions
      "no-unused-vars": "off",
      "no-implied-eval": "off",
      "no-throw-literal": "off",

      // typescript overrides - additions not covered by presets
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
      "@typescript-eslint/strict-boolean-expressions": "error",
      "@typescript-eslint/return-await": ["error", "always"],
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": "error",

      // general best practices
      "no-console": ["error", { allow: ["warn", "error"] }],
      "no-debugger": "error",
      "no-alert": "error",
      "no-eval": "error",
      eqeqeq: ["error", "always"],
      "prefer-template": "error",
      "prefer-arrow-callback": "error",
      "no-param-reassign": "error",
      "no-return-assign": ["error", "always"],
      "no-self-compare": "error",
      "no-template-curly-in-string": "error",
      "no-unmodified-loop-condition": "error",
      "no-unreachable-loop": "error",
      "no-useless-concat": "error",
      "no-useless-rename": "error",
      "object-shorthand": "error",
      "prefer-destructuring": ["error", { object: true, array: false }],

      // svelte overrides - additions not covered by recommended
      "svelte/prefer-class-directive": "error",
      "svelte/prefer-style-directive": "error",
      "svelte/shorthand-attribute": "error",
      "svelte/shorthand-directive": "error",
      "svelte/sort-attributes": "error",
      "svelte/spaced-html-comment": "error",
      // these classes are defined globally in app.css
      "svelte/no-unused-class-name": [
        "error",
        {
          allowedClassNames: [
            "panel",
            "site-wrapper",
            "post-list",
            "prose",
            "py-keyword",
            "py-func",
            "py-string",
            "py-comment",
            "py-decorator",
            "py-param",
            "py-self",
          ],
        },
      ],
      // {" "} is intentional whitespace between inline elements
      "svelte/no-useless-mustaches": "off",
      // external URLs don't go through SvelteKit's router
      "svelte/no-navigation-without-resolve": "off",
    },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
        svelteConfig,
      },
    },
  },
  {
    ignores: [".svelte-kit/", "build/", "node_modules/"],
  },
]);
