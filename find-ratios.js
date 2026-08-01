const fs = require('fs');
const js = fs.readFileSync('./js/utils.js', 'utf-8');
const lines = js.split('\n');
lines.forEach((line, idx) => {
  if (line.toLowerCase().includes('sharpe') || line.toLowerCase().includes('sortino')) {
    console.log(`${idx + 1}: ${line}`);
  }
});
