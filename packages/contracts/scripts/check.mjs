// CI: сгенерированные типы должны совпадать с openapi.yaml
import { readFileSync } from 'node:fs';
const a = readFileSync('src/types.gen.ts', 'utf8');
const b = readFileSync('/tmp/types.check.ts', 'utf8');
if (a !== b) {
  console.error('✖ packages/contracts/src/types.gen.ts устарел — запусти pnpm contracts:gen');
  process.exit(1);
}
console.log('✔ contracts: types.gen.ts актуален');
