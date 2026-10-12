// Copies build artifacts into the target Obsidian vault's plugins folder.
const fs = require('fs');
const path = require('path');

const VAULT = process.env.PRISM_VAULT || "D:\\Academic\\Papers\\Notes\\Meno‘s Academic Notes";
const target = path.join(VAULT, '.obsidian', 'plugins', 'prism-studio');
const files = ['main.js', 'styles.css', 'manifest.json'];

if (!fs.existsSync(target)) {
  console.error(`Plugin folder not found: ${target}`);
  process.exit(1);
}
for (const file of files) {
  fs.copyFileSync(path.join(__dirname, '..', file), path.join(target, file));
}
console.log(`Installed to ${target}`);
