const fs = require('fs');
const file = 'src/engine/events/FirstPhaseEvent.ts';
let code = fs.readFileSync(file, 'utf8');

// Remove definitions of style, goCrashBall, playType
code = code.replace(/const style = attackTeam\.tactics\.attackingStyle;\s*/g, '');
code = code.replace(/const goCrashBall = rng\(1, 100\) <= CRASH_BALL_THRESHOLDS\[style\];\s*/g, '');
code = code.replace(/const playType = goCrashBall \? 'crash_ball' : 'out_the_back';\s*/g, '');

// Insert right after attackOnField
const topTarget = `const attackOnField = onFieldPlayers(attackTeam, state, attackSide);`;
const topCode = `
  const style = attackTeam.tactics.attackingStyle;
  const goCrashBall = rng(1, 100) <= CRASH_BALL_THRESHOLDS[style];
  const playType = goCrashBall ? 'crash_ball' : 'out_the_back';
`;

code = code.replace(topTarget, topTarget + topCode);

fs.writeFileSync(file, code);
