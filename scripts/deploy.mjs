#!/usr/bin/env node
/**
 * Deploy command for Cloudflare Workers Builds (dashboard: Deploy command = `npm run deploy`).
 *
 * 1. Make sure the D1 database "xpost" exists. On the very first deploy it does not, and `d1 migrations apply`
 *    cannot run against a database that does not exist, so it is created here (location hint D1_LOCATION,
 *    default weur). `wrangler deploy` then finds it by name (automatic provisioning connects to an existing
 *    database with the configured database_name), so no database_id is needed in wrangler.toml.
 * 2. Apply pending migrations (worker/migrations) BEFORE the new code goes live. Wrangler takes a backup first and
 *    rolls back a migration that fails; a failure stops the deploy, so new code never runs on an old schema.
 * 3. `wrangler deploy`.
 *
 * Needs the Workers Builds API token to have "D1: Edit" (the token Cloudflare creates by default does not).
 * `node scripts/deploy.mjs --dry-run` prints the steps without running anything.
 */
import { spawnSync } from 'node:child_process';

const DB = 'xpost';
const LOCATION = process.env.D1_LOCATION || 'weur';
const dryRun = process.argv.includes('--dry-run');

function wrangler(args, { capture = false } = {}) {
  console.log(`$ npx wrangler ${args.join(' ')}`);
  if (dryRun) return { status: 0, output: '' };
  const r = spawnSync('npx', ['wrangler', ...args], { stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit', encoding: 'utf8', shell: process.platform === 'win32' });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (capture) process.stdout.write(output);
  return { status: r.status ?? 1, output };
}

function fail(message) {
  console.error(`\ndeploy: ${message}`);
  process.exit(1);
}

const PERMISSION_HELP = 'Wrangler could not use D1. Give the Workers Builds API token "Account > D1 > Edit" (see README, Deploy).';

const info = wrangler(['d1', 'info', DB, '--json'], { capture: true });
if (info.status !== 0) {
  if (/couldn'?t find|not found|7404/i.test(info.output)) {
    console.log(`deploy: D1 database "${DB}" does not exist yet (first deploy); creating it.`);
    if (wrangler(['d1', 'create', DB, '--location', LOCATION]).status !== 0) fail(`could not create D1 database "${DB}". ${PERMISSION_HELP}`);
  } else if (/auth|permission|10000|forbidden|403/i.test(info.output)) {
    fail(PERMISSION_HELP);
  } else {
    fail(`could not look up D1 database "${DB}" (see the output above).`);
  }
}
if (wrangler(['d1', 'migrations', 'apply', DB, '--remote']).status !== 0) fail('D1 migrations failed; nothing was deployed.');
if (wrangler(['deploy']).status !== 0) fail('wrangler deploy failed.');
console.log('deploy: done.');
