const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    if (['node_modules', '.git', '.github'].includes(file)) return;
    const filepath = path.join(dir, file);
    const stat = fs.statSync(filepath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(filepath));
    } else if (filepath.endsWith('.js')) {
      results.push(filepath);
    }
  });
  return results;
}

const jsFiles = walk('.');
jsFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.toLowerCase().includes('sharpe') || line.toLowerCase().includes('sortino')) {
      console.log(`${file}:${idx + 1}: ${line.trim()}`);
    }
  });
});
