import { readFileSync } from 'node:fs';
import { checkDocumentation, type DocsPolicy } from './docs';
const policy=JSON.parse(readFileSync('scripts/verification/docs-policy.json','utf8')) as DocsPolicy;
const errors=checkDocumentation(process.cwd(),policy);
for(const error of errors)console.error(`${error.file}:${error.line??1} [${error.rule}] ${error.target??''}: ${error.message}`);
if(errors.length)process.exitCode=1;else console.log('Documentation consistency passed (offline references, commands, and new-plan metadata).');
