// Dependency graph rules: the "Dependency rules" table in AGENTS.md, checked in CI.
// ESLint's no-restricted-imports catches the same problems in the editor.
const TEST = '\\.test\\.tsx?$|/test/';
/** Test files may also use the in-memory host and the shared contract suite. */
const TEST_HELPERS = '^packages/(host-memory|host-contract-tests)/';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      comment:
        'Usually an undeclared dependency: pnpm only resolves packages listed in package.json.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'core-is-pure',
      comment: 'core depends on nothing: no other packages, React, Tauri, zod, or Node APIs.',
      severity: 'error',
      from: { path: '^packages/core/src/', pathNot: TEST },
      to: {
        pathNot: '^packages/core/src/',
      },
    },
    {
      name: 'app-depends-on-core-only',
      severity: 'error',
      from: { path: '^packages/app/src/', pathNot: TEST },
      to: { path: '^packages/', pathNot: ['^packages/(app|core)/'] },
    },
    {
      name: 'ui-never-touches-hosts',
      severity: 'error',
      from: { path: '^packages/ui/src/', pathNot: TEST },
      to: {
        path: ['^packages/', 'node_modules/@tauri-apps/'],
        pathNot: ['^packages/(ui|app|core)/'],
      },
    },
    {
      name: 'adapters-depend-on-core-only',
      severity: 'error',
      from: {
        path: '^packages/(host-memory|host-tauri|setting-catalog|host-contract-tests|bridge-protocol)/src/',
        pathNot: TEST,
      },
      to: { path: '^packages/', pathNot: ['^packages/$1/', '^packages/core/'] },
    },
    {
      name: 'host-orca-depends-on-core-and-protocol',
      severity: 'error',
      from: { path: '^packages/host-orca/src/', pathNot: TEST },
      to: { path: '^packages/', pathNot: ['^packages/(host-orca|core|bridge-protocol)/'] },
    },
    {
      name: 'tests-use-only-sanctioned-helpers',
      comment: 'Tests may add host-memory and host-contract-tests to what their package may use.',
      severity: 'error',
      from: { path: '^packages/(app|ui|core)/src/.*\\.test\\.tsx?$' },
      to: { path: '^packages/', pathNot: ['^packages/(app|ui|core)/', TEST_HELPERS] },
    },
    {
      name: 'packages-never-import-apps-or-tools',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^(apps|tools)/' },
    },
    {
      name: 'nothing-imports-tools',
      severity: 'error',
      from: { pathNot: '^tools/' },
      to: { path: '^tools/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['(^|/)dist/', 'src-tauri/'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'],
    },
  },
};
