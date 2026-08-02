const fs = require('fs');
const readline = require('readline');

async function printStep() {
  const fileStream = fs.createReadStream('C:/Users/Miguel/.gemini/antigravity/brain/49f92eb2-240a-4e66-9c6d-c96a65a02c1e/.system_generated/logs/transcript_full.jsonl');

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let index = 0;
  for await (const line of rl) {
    index++;
    if (index === 292) {
      console.log(JSON.stringify(JSON.parse(line), null, 2));
      break;
    }
  }
}

printStep();
