import { spawn, execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SERVER_DIR = join(ROOT, 'server');

// Install server dependencies if needed
let depsInstalled = false;
try {
  readFileSync(join(SERVER_DIR, 'node_modules', 'express', 'package.json'));
  depsInstalled = true;
} catch {}

if (!depsInstalled) {
  console.log('Installing server dependencies...');
  execSync('npm install', { cwd: SERVER_DIR, stdio: 'inherit' });
}

// Build frontend if dist doesn't exist
if (!existsSync(join(ROOT, 'dist', 'index.html'))) {
  console.log('Building frontend...');
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
}

console.log('\nStarting Storyboard Copilot (Web mode)...\n');
const backend = spawn('node', ['server/index.js'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, PORT: '3142' },
});

process.on('SIGINT', () => {
  backend.kill();
  process.exit(0);
});

backend.on('exit', (code) => process.exit(code || 0));
