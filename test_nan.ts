import { parseChoreography } from './src/engine/balance/firstPhaseChoreography.ts';
import fs from 'fs';

const files = fs.readdirSync('./public/assets/phases').filter(f => f.endsWith('.json'));
for (const file of files) {
  const moveData = JSON.parse(fs.readFileSync('./public/assets/phases/' + file, 'utf-8'));
  try {
    const parsed = parseChoreography(moveData, 1);
    console.log(file, "authoredAnchorX:", parsed.authoredAnchorX, "authoredAnchorY:", parsed.authoredAnchorY);
  } catch (e) {
    console.log(file, "ERROR:", e.message);
  }
}
