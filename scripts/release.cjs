// Full release flow: build -> install to vault -> commit -> push.
// Usage: npm run release -- "commit message"
const { spawnSync } = require('child_process');

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const message = process.argv.slice(2).find(a => !a.startsWith('-'))
  || `chore: sync Prism Studio ${new Date().toISOString().slice(0, 10)}`;

run('npm', ['run', 'build']);
run('node', ['scripts/install.cjs']);
run('git', ['add', '-A']);
spawnSync('git', ['commit', '-m', message], { stdio: 'inherit' });
run('git', ['push', 'origin', 'main']);
console.log('Released: built, installed to vault, committed and pushed.');
