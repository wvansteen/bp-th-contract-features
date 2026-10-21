import js from "@eslint/js";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import eslintConfigPrettier from "eslint-config-prettier";
import functional from "eslint-plugin-functional";
import svelte from "eslint-plugin-svelte";
import { createNodeResolver, importX } from "eslint-plugin-import-x";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      "node_modules/",
      ".vercel/",
      ".svelte-kit/",
      "eslint.config.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: [".svelte"],
      },
    },
  },
  {
    // Make the HARD LOCKS reach Svelte script blocks.
    files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        parser: tseslint.parser,
      },
    },
  },
  eslintConfigPrettier,
  {
    plugins: { functional },
    rules: {
      // HARD LOCKS
      "functional/no-let": "error",
      "no-var": "error",
      "prefer-const": "error",
      "functional/immutable-data": "error",
      "no-param-reassign": ["error", { props: true }],
      "no-plusplus": "error",
      "functional/no-loop-statements": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-function-type": "error",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowAny: false },
      ],
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-ignore": true, "ts-expect-error": true },
      ],
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-unsafe-type-assertion": "error",
      "no-eval": "error",
      "no-console": "off",
    },
  },
  {
    rules: {
      // FRAMEWORK RELAXATIONS (non-lock rules only)
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { arguments: false } },
      ],
    },
  },
  {
    // ADD NEW RULES HERE
    plugins: { "import-x": importX },
    settings: {
      "import-x/resolver-next": [
        createTypeScriptImportResolver({ bun: true }),
        createNodeResolver(),
      ],
    },
  },
  {
    files: ["src/api/**"],
    rules: {
      "import-x/no-restricted-paths": [
        "error",
        {
          basePath: import.meta.dirname,
          zones: [
            // The backend reaches only into itself.
            { target: "src/api", from: "src", except: ["api"] },
          ],
        },
      ],
    },
  },
  {
    // The frontend reaches the backend only through the SvelteKit route.
    files: ["src/**"],
    ignores: ["src/api/**", "src/routes/api/[[]...slugs]/+server.ts"],
    rules: {
      "import-x/no-restricted-paths": [
        "error",
        {
          basePath: import.meta.dirname,
          zones: [{ target: "src", from: "src/api" }],
        },
      ],
    },
  },
);
