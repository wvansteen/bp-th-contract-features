import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import functional from "eslint-plugin-functional";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    // eslint.config.ts is outside tsconfig.json's `include: ["src"]`, so the
    // project service cannot type it. Widening tsconfig is out of scope.
    ignores: ["dist/", "node_modules/", "eslint.config.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
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
    rules: {
      // ADD NEW RULES HERE
    },
  },
);
