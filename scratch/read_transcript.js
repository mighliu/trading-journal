const fs = require('fs');
const readline = require('readline');

async function processLineByLine() {
  const fileStream = fs.createReadStream('C:/Users/Miguel/.gemini/antigravity/brain/49f92eb2-240a-4e66-9c6d-c96a65a02c1e/.system_generated/logs/transcript.jsonl');

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let index = 0;
  for await (const line of rl) {
    index++;
    const step = JSON.parse(line);
    if (step.type === 'USER_INPUT') {
      const contentSnippet = typeof step.content === 'string' ? step.content.substring(0, 150).replace(/\n/g, ' ') : '';
      console.log(`[Step ${index}] User input snippet: ${contentSnippet}`);
      
      // If it contains trades or mentions xlsx/csv/json
      if (step.content && (step.content.includes('xlsx') || step.content.includes('trades') || step.content.includes('csv') || step.content.includes('Sharpe'))) {
        console.log(` ---> Match found in Step ${index}!`);
      }
    }
  }
}

processLineByLine();
