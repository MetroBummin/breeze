import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const sync=readFileSync(resolve(root,'scripts/sync/sync.js'),'utf8');

assert.doesNotMatch(sync,/setInterval\([^\n]*doSync/,
  'Idle foreground time still polls the complete sync path');
assert.doesNotMatch(sync,/from\('words'\)\.select\('key,data'\)\.eq\('user_id',sbUser\.id\);/,
  'Normal v2 sync still downloads every words row');
assert.match(sync,/select\('data'\)\.eq\('user_id',sbUser\.id\)\.eq\('key',VAULT_META_ROW\)\.maybeSingle\(\)/,
  'Sync does not use the small metadata row as its first remote check');
assert.match(sync,/select\('data'\)\.eq\('user_id',sbUser\.id\)\.eq\('key',VAULT_ROW\)\.maybeSingle\(\)/,
  'Vault download is not restricted to the encrypted vault key');
assert.match(sync,/vaultMeta\.legacyCleanedAt\|\|vaultMeta\.legacyMigratedAt/,
  'Completed legacy migration does not skip legacy tables');
assert.match(sync,/if\(migrationNeeded\)\{[\s\S]*readLegacyData\(await readLegacyRows\(\)\)/,
  'Legacy reads are not gated behind migration state');
assert.doesNotMatch(sync,/from\('(?:words|books|positions)'\)\.delete\(\)|storage\.from\('books'\)\.list\(/,
  'Emergency hardening still deletes or lists legacy server data');
assert.match(sync,/remoteVersion!==seenVersion/,
  'Remote metadata version is not compared before downloading the vault');
assert.doesNotMatch(sync,/const needsVault=manual\|\|/,
  'Manual sync still downloads an unchanged full vault instead of checking metadata');
assert.match(sync,/if\(!needsVault\)\{[\s\S]{0,260}return true/,
  'An unchanged automatic sync cannot stop before the vault fetch');
assert.match(sync,/syncCooldownUntil=Date\.now\(\)\+delay/,
  'Network and quota failures have no request cooldown');
assert.match(sync,/syncErrorStatus\(error\)===402/,
  'HTTP 402 is not recognized as a quota restriction');

console.log('Sync egress hardening checks passed');
