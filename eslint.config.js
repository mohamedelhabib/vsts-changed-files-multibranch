// @ts-check
const eslint = require("@eslint/js");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
    { ignores: ["**/*.js", "!eslint.config.js", "node_modules/**"] },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["changed-files/**/*.ts"],
        rules: {
            "@typescript-eslint/no-use-before-define": ["error", { functions: false, classes: false, typedefs: false }],
            "@typescript-eslint/explicit-function-return-type": ["error", { allowExpressions: true }],
            "@typescript-eslint/array-type": ["error", { default: "array-simple", readonly: "array-simple" }],
        },
    },
);
