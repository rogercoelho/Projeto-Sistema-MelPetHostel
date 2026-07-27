const reactHooks = require("eslint-plugin-react-hooks");

module.exports = [
  {
    // parser / language settings
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      // declare common browser globals as readonly to avoid no-undef
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        fetch: "readonly",
        FormData: "readonly",
        MutationObserver: "readonly",
        MessageChannel: "readonly",
        performance: "readonly",
        AbortController: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        atob: "readonly",
        File: "readonly",
        URL: "readonly",
        Image: "readonly",
        queueMicrotask: "readonly",
        matchMedia: "readonly",
        navigation: "readonly",
        __REACT_DEVTOOLS_GLOBAL_HOOK__: "readonly",
        console: "readonly",
        process: "readonly",
        globalThis: "readonly",
      },
    },
  },
  {
    // Basic rules for JS/JSX files. Keep minimal to avoid requiring extra plugins.
    files: ["**/*.js", "**/*.jsx"],
    ignores: ["dist/**", "node_modules/**"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "no-unused-vars": "off",
      "no-undef": "error",
      "no-console": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
