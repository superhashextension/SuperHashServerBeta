import js from "@eslint/js";
import globals from "globals";

export default [
  // 1. Apply rules to all JavaScript files
  js.configs.recommended,
  
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node, // Enables Node.js global variables (process, Buffer, etc.)
        ...globals.es2021
      }
    },
    rules: {
      // 2. Strict error checking for missing/unused code
      "no-undef": "error",       // Flags missing imports like 'log' or 'Settings'
      "no-unused-vars": ["error", { 
        "vars": "all", 
        "args": "after-used", 
        "ignoreRestSiblings": true 
      }],                        // Flags unused imports like 'bcrypt' or 'Device'
      
      // 3. Best practices for clean backend code
      "no-console": "warn",      // Encourages using your 'log' utility instead of console.log
      "prefer-const": "error",   // Forces 'const' instead of 'let' if variables aren't reassigned
      "no-unreachable": "error"  // Flags code placed after a return statement
    }
  }
];
