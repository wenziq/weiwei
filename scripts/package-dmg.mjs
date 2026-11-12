import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import process from 'node:process';

const root = new URL('..', import.meta.url).pathname;
const tauriConfig = JSON.parse(readFileSync(`${root}apps/desktop/src-tauri/tauri.conf.json`, 'utf8'));
const { productName, version } = tauriConfig;
const build = spawnSync('pnpm', ['--filter', '@weiwei/desktop', 'tauri', 'build', '--bundles', 'dmg'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});
const output = `${build.stdout ?? ''}${build.stderr ?? ''}`;
if (output) process.stdout.write(output);
if (build.error) throw build.error;
if (build.status === 0) process.exit(0);
if (process.platform !== 'darwin' || !output.includes('-1712')) process.exit(build.status ?? 1);

console.warn('Finder AppleEvent 超时，改用 create-dmg 沙盒兼容路径完成打包。');
const bundle = `${root}apps/desktop/src-tauri/target/release/bundle`;
const script = `${bundle}/dmg/bundle_dmg.sh`;
const application = `${bundle}/macos/${productName}.app`;
if (!existsSync(script) || !existsSync(application)) throw new Error('Tauri 未生成应用或 create-dmg 脚本，无法继续打包。');
const staging = `${bundle}/dmg/staging`;
const architecture = process.arch === 'arm64' ? 'aarch64' : process.arch;
const destination = `${bundle}/dmg/${productName}_${version}_${architecture}.dmg`;
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
cpSync(application, `${staging}/${productName}.app`, { recursive: true });
rmSync(destination, { force: true });
const packaged = spawnSync('bash', [
  script,
  '--sandbox-safe', '--skip-jenkins',
  '--volname', productName,
  '--volicon', `${root}apps/desktop/src-tauri/icons/icon.icns`,
  '--app-drop-link', '180', '170',
  destination,
  staging,
], { cwd: root, stdio: 'inherit' });
if (packaged.status !== 0) process.exit(packaged.status ?? 1);
console.log(`DMG 已生成：${destination}`);
