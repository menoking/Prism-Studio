// 向 obsidianmd/obsidian-releases 提交/更新社区插件条目。
// 前置：先在 GitHub 网页 Fork obsidianmd/obsidian-releases 到你自己的账号。
// Usage: node scripts/submit-marketplace.cjs [forkOwner] [branch]
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const owner = process.argv[2] || 'menoking';
const branch = process.argv[3] || 'add-prism-studio';
const workDir = path.join(__dirname, '..', '..', 'obsidian-releases');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));

const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (!fs.existsSync(workDir)) run('git', ['clone', `git@github.com:${owner}/obsidian-releases.git`, workDir]);

spawnSync('git', ['remote', 'add', 'upstream', 'https://github.com/obsidianmd/obsidian-releases.git'], { cwd: workDir });
spawnSync('git', ['remote', 'set-url', 'upstream', 'https://github.com/obsidianmd/obsidian-releases.git'], { cwd: workDir });
run('git', ['fetch', 'upstream', 'master'], workDir);
run('git', ['checkout', '-B', branch, 'upstream/master'], workDir);

const file = path.join(workDir, 'community-plugins.json');
const list = JSON.parse(fs.readFileSync(file, 'utf8'));
const entry = {
  id: manifest.id,
  name: manifest.name,
  author: manifest.author,
  description: manifest.description,
  repo: `${owner}/Prism-Studio`,
  branch: 'main'
};
const existing = list.findIndex(p => p.id === entry.id);
if (existing >= 0) {
  list[existing] = entry;
  console.log(`Updated existing entry: ${entry.id}`);
} else {
  list.push(entry);
  console.log(`Appended entry at index ${list.length - 1}: ${entry.id}`);
}
fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n');

run('git', ['add', 'community-plugins.json'], workDir);
spawnSync('git', ['commit', '-m', `Add ${manifest.name} to community plugins`], { cwd: workDir, stdio: 'inherit' });
run('git', ['push', '-f', 'origin', branch], workDir);
console.log(`\n打开以下链接创建 PR：\nhttps://github.com/${owner}/obsidian-releases/pull/new/${branch}`);
