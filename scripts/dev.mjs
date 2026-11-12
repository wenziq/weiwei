import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import process from 'node:process';

const root = new URL('..', import.meta.url).pathname;
const apiPython = `${root}services/market-api/.venv/bin/python`;
const children = [];
const withTauri = process.argv.includes('--tauri');

if (!existsSync(apiPython)) {
  console.error('Missing API environment. Run `pnpm setup:api` first.');
  process.exit(1);
}

const contractsBuild = spawnSync('pnpm', ['--filter', '@weiwei/contracts', 'build'], { cwd: root, stdio: 'inherit' });
if (contractsBuild.status !== 0) process.exit(contractsBuild.status ?? 1);

function run(command, args, cwd, name) {
  const child = spawn(command, args, { cwd, stdio: 'inherit', env: { ...process.env, PYTHONUNBUFFERED: '1', WEIWEI_HISTORY_AUTO_START: process.env.WEIWEI_HISTORY_AUTO_START ?? '1' } });
  child.on('exit', code => { if (code && !shuttingDown) shutdown(code); });
  children.push(child);
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  children.forEach(child => child.kill('SIGTERM'));
  setTimeout(() => process.exit(code), 250);
}

process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
run(apiPython, ['-m', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', '8000'], `${root}services/market-api`, 'api');
run('pnpm', withTauri ? ['--filter', '@weiwei/desktop', 'tauri', 'dev'] : ['--filter', '@weiwei/desktop', 'dev'], root, 'desktop');
