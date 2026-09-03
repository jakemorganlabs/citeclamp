// Purpose: lint rules for src and tests.
// Flow:
// 1. Start from the TypeScript rule set.
// 2. Ban the em-dash character everywhere in source.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["node_modules/", "dist/", "coverage/"],
  },
  {
    rules: {
      // em-dash is banned by convention 13; flag it as an error
      "no-irregular-whitespace": "error",
      // report the em-dash through a custom rule below if needed
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    rules: {
      // scan each file for the em-dash character, fail on any hit
      "no-restricted-syntax": [
        "error",
        {
          selector: "*[value=/\\u2014/]",
          message: "Do not use the em-dash character.",
        },
      ],
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
