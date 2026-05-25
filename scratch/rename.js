import fs from 'fs';
import path from 'path';

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('.git') && !file.includes('.gemini')) {
        results = results.concat(walk(file));
      }
    } else {
      if (file.endsWith('.ts') || file.endsWith('.json') || file.endsWith('.md')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk('.');

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('pick_and_drive') || content.includes('wide_play') || content.includes('Wide Play')) {
    const newContent = content
      .replace(/pick_and_drive/g, 'commit_numbers')
      .replace(/wide_play/g, 'minimal_ruck')
      .replace(/'Wide Play'/g, "'Minimal Ruck'");
    fs.writeFileSync(file, newContent, 'utf8');
    console.log('Updated ' + file);
  }
}
