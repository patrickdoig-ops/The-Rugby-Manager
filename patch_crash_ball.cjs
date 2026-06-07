const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/engine/balance/firstPhaseChoreography.ts');
let content = fs.readFileSync(filePath, 'utf8');

const startIdx = content.indexOf("'crash_ball': parseChoreography({");
const endIdx = content.indexOf("'SCRUM:wheel': parseChoreography({");

let crashBallContent = content.substring(startIdx, endIdx);

// We need to find all blocks that look like:
//         {
//           "t": 1,
//           "x": 16,
//           "y": 43
//         }
// And replace "x": 16 with "x": 100 - 16 = 84

crashBallContent = crashBallContent.replace(/{\s*"t":\s*1,\s*"x":\s*([0-9.]+)(.*?)}/g, (match, xVal, rest) => {
  const x = parseFloat(xVal);
  const newX = +(100 - x).toFixed(2);
  return `{\n          "t": 1,\n          "x": ${newX}${rest}}`;
});

content = content.substring(0, startIdx) + crashBallContent + content.substring(endIdx);
fs.writeFileSync(filePath, content, 'utf8');
console.log("Patched crash_ball in firstPhaseChoreography.ts");
