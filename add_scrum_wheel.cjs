const fs = require('fs');
const rtf = require('child_process').execSync('textutil -convert txt "Animator JSONs/SCRUM WHEEL.rtf" -stdout').toString();
const jsonStr = rtf.trim();

let content = fs.readFileSync('src/engine/balance/firstPhaseChoreography.ts', 'utf8');
const searchStr = `};`;
const insertStr = `
  'SCRUM:wheel': parseChoreography(${jsonStr}),
`;

content = content.replace(/};\s*$/, insertStr + '};\n');
fs.writeFileSync('src/engine/balance/firstPhaseChoreography.ts', content);
