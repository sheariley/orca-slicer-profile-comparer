// Lint config. The `no-restricted-imports` blocks enforce the package dependency rules in
// AGENTS.md; dependency-cruiser (.dependency-cruiser.cjs) checks the same rules on the graph.
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const TESTS = ['**/*.test.ts', '**/*.test.tsx', '**/test/**'];
const REACT = ['react', 'react/*', 'react-dom', 'react-dom/*'];
const TAURI = ['@tauri-apps/*'];
const NODE = ['node:*'];
/** Packages are imported through their index only (theme CSS is the one public subpath). */
const NO_DEEP = {
  regex: '^@comparer/(?!ui/theme/[^/]+\\.css$)[^/]+/',
  message: 'Import other packages through their index.',
};

/** Allows only the listed workspace packages, plus anything not in `banned`. */
function restrict(name, allowedPackages, banned = []) {
  const group = ['@comparer/*', ...allowedPackages.map((pkg) => `!@comparer/${pkg}`), ...banned];
  return {
    files: [`packages/${name}/src/**/*.{ts,tsx}`],
    ignores: TESTS,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group,
              message: `@comparer/${name} may not import this. See "Dependency rules" in AGENTS.md.`,
            },
            NO_DEEP,
          ],
        },
      ],
    },
  };
}

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'apps/desktop/src-tauri/target/**',
      'apps/desktop/src-tauri/gen/**',
      'coverage/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['packages/ui/**/*.{ts,tsx}', 'apps/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: ['packages/ui/src/**/*.tsx'],
    ignores: TESTS,
    plugins: { 'react-refresh': reactRefresh },
    rules: { 'react-refresh/only-export-components': ['warn', { allowConstantExport: true }] },
  },

  // Dependency rules (non-test sources).
  restrict('core', [], [...REACT, ...TAURI, ...NODE, 'zod']),
  restrict('app', ['core'], [...REACT, ...TAURI, ...NODE]),
  restrict('ui', ['app', 'core'], [...TAURI, ...NODE]),
  restrict('setting-catalog', ['core'], [...REACT, ...TAURI, ...NODE]),
  restrict('bridge-protocol', [], [...REACT, ...TAURI, ...NODE]),
  restrict('host-contract-tests', ['core'], [...REACT, ...TAURI, ...NODE]),
  restrict('host-memory', ['core'], [...REACT, ...TAURI, ...NODE]),
  restrict('host-tauri', ['core'], [...REACT, ...NODE]),
  restrict('host-orca', ['core', 'bridge-protocol'], [...REACT, ...TAURI, ...NODE]),
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/*/src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [NO_DEEP] }],
    },
  },
);
