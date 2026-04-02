const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/run_python.js <script> [...args]');
  process.exit(1);
}

const projectRoot = path.resolve(__dirname, '..');
const candidates = process.platform === 'win32'
  ? [
      path.join(projectRoot, '.venv', 'Scripts', 'python.exe'),
      'python',
      'py',
    ]
  : [
      path.join(projectRoot, '.venv', 'bin', 'python'),
      'python',
      'python3',
    ];

for (const candidate of candidates) {
  const command = typeof candidate === 'string' ? candidate : String(candidate);
  if (command.includes(path.sep) && !fs.existsSync(command)) {
    continue;
  }

  const finalArgs = command === 'py' ? ['-3', ...args] : args;
  const result = spawnSync(command, finalArgs, { stdio: 'inherit' });

  if (!result.error) {
    process.exit(result.status ?? 0);
  }

  if (result.error.code !== 'ENOENT') {
    console.error(result.error.message);
    process.exit(1);
  }
}

console.error('No usable Python interpreter found. Install Python or create .venv first.');
process.exit(1);
