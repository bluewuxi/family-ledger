import js from '@eslint/js';
import ts from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import {fileURLToPath} from 'node:url';
const typed = ['apps/web/src/**/*.{ts,tsx}', 'apps/api/src/**/*.ts', 'apps/jobs/src/**/*.ts', 'packages/shared/src/**/*.ts'];
export default [
 {ignores:['**/node_modules/**','**/dist/**','**/build/**','**/.vite/**','**/.aws-sam/**','**/coverage/**','.git/**','tmp/**','.local/**','**/*.tsbuildinfo']},
 {files:['**/*.{js,mjs,cjs,ts,tsx,mts,cts}'],rules:{...js.configs.recommended.rules,eqeqeq:['error','always',{null:'ignore'}],'prefer-const':'error'},linterOptions:{reportUnusedDisableDirectives:'error'}},
 ...ts.configs.recommended.map(c=>({...c,files:['**/*.{ts,tsx,mts,cts}']})),
 {files:['**/*.{ts,tsx,mts,cts}'],rules:{'@typescript-eslint/no-unused-vars':['error',{args:'all',argsIgnorePattern:'^_',caughtErrors:'all',caughtErrorsIgnorePattern:'^_',ignoreRestSiblings:true}]}},
 {files:['scripts/**/*.{ts,js,mjs,cjs}','apps/api/src/**/*.ts','apps/jobs/src/**/*.ts','apps/web/verify-*.ts','apps/web/vite.config.ts','**/*.mjs'],languageOptions:{globals:globals.node}},
 {files:['apps/web/src/**/*.{ts,tsx}','apps/web/public/**/*.js'],languageOptions:{globals:globals.browser}},
 {files:['apps/web/public/theme-init.js'],languageOptions:{sourceType:'script'}},
 {files:typed,languageOptions:{parserOptions:{projectService:true,tsconfigRootDir:fileURLToPath(new URL('.',import.meta.url))}},rules:{'@typescript-eslint/no-floating-promises':['error',{ignoreVoid:false,checkThenables:true}],'@typescript-eslint/no-misused-promises':'error','@typescript-eslint/await-thenable':'error'}},
 {files:['apps/web/src/**/*.{ts,tsx}'],plugins:{'react-hooks':hooks},rules:{'react-hooks/rules-of-hooks':'error','react-hooks/exhaustive-deps':'error'}}
];
