import js from "@eslint/js";
import ts from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default ts.config(
	js.configs.recommended,
	...ts.configs.strict,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
		rules: {
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
			"@typescript-eslint/explicit-function-return-type": "off",
			"@typescript-eslint/no-inferrable-types": "error",
			"@typescript-eslint/consistent-type-imports": "error",
			// fires on external links too, which is a false positive
			"svelte/no-navigation-without-resolve": "off",
			// {" "} is idiomatic for forced whitespace in svelte templates
			"svelte/no-useless-mustaches": "off",
		},
	},
	{
		files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
		languageOptions: {
			parserOptions: {
				parser: ts.parser,
			},
		},
	},
	{
		ignores: [".svelte-kit/", "build/", "node_modules/", "src/posts/"],
	},
);
