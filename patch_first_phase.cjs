const fs = require('fs');
const file = 'src/engine/events/FirstPhaseEvent.ts';
let code = fs.readFileSync(file, 'utf8');

// 1. Hoist style, goCrashBall, playType
const hoistTarget = `  const scrumHalf = attackOnField.find(p => p.id === SLOT.SCRUM_HALF) ?? attackOnField[0] ?? attackTeam.players[0];`;
const hoistCode = `
  const style = attackTeam.tactics.attackingStyle;
  const goCrashBall = rng(1, 100) <= CRASH_BALL_THRESHOLDS[style];
  const playType = goCrashBall ? 'crash_ball' : 'out_the_back';
`;
code = code.replace(hoistTarget, hoistTarget + '\n' + hoistCode);

code = code.replace(`  const style = attackTeam.tactics.attackingStyle;\n`, '');
code = code.replace(`  const goCrashBall = rng(1, 100) <= CRASH_BALL_THRESHOLDS[style];\n`, '');
code = code.replace(`  const playType = goCrashBall ? 'crash_ball' : 'out_the_back';\n`, '');

// 2. Wrap all returns in applyChoreography(..., playType)
code = code.replace(/return \{\s*nextPhase:/g, 'return applyChoreography({\n      nextPhase:');
code = code.replace(/events,\s*\};/g, 'events,\n    }, playType);');
code = code.replace(/events \};/g, 'events }, playType);');

// 3. Inject the dynamic truncation logic into applyChoreography.
const truncateLogic = `
    // --- Dynamic Truncation ---
    let truncateT = 1.0;
    const koEvent = res.events.find((e: any) => e.type === 'KNOCK_ON') as any;
    const intEvent = res.events.find((e: any) => e.type === 'INTERCEPTION') as any;
    const carryEvent = res.events.find((e: any) => e.type === 'CARRY_RESOLVED') as any;

    if (koEvent || intEvent) {
      const receiverSlot = koEvent ? koEvent.player.id : (intEvent.passer.id === SLOT.SCRUM_HALF ? SLOT.FLY_HALF : (goCrashBall ? SLOT.CENTRE_12 : SLOT.CENTRE_13));
      let mappedSlot = receiverSlot;
      const swapLateral = flipX !== flipY;
      if (swapLateral) {
         if (mappedSlot === 11) mappedSlot = 14;
         else if (mappedSlot === 14) mappedSlot = 11;
         else if (mappedSlot === 1) mappedSlot = 3;
         else if (mappedSlot === 3) mappedSlot = 1;
         else if (mappedSlot === 6) mappedSlot = 7;
         else if (mappedSlot === 7) mappedSlot = 6;
      }
      
      const receiverChoreo = choreography.find(c => c.id === mappedSlot);
      if (receiverChoreo && receiverChoreo.movements.length > 0) {
        let minT = 0;
        let minDist = 9999;
        for (const bk of authoredBallEvents) {
           const rk = receiverChoreo.movements.find(m => m.t === bk.t) || receiverChoreo.movements[0];
           const d = Math.hypot(bk.x - rk.x, bk.y - rk.y);
           if (d < minDist) {
             minDist = d;
             minT = bk.t;
           }
        }
        truncateT = minT;
      }
    } else if (carryEvent && carryEvent.outcome !== 'line_break') {
       let mappedSlot = carryEvent.carrier.id;
       const swapLateral = flipX !== flipY;
       if (swapLateral) {
         if (mappedSlot === 11) mappedSlot = 14;
         else if (mappedSlot === 14) mappedSlot = 11;
         else if (mappedSlot === 1) mappedSlot = 3;
         else if (mappedSlot === 3) mappedSlot = 1;
         else if (mappedSlot === 6) mappedSlot = 7;
         else if (mappedSlot === 7) mappedSlot = 6;
       }
       const carrierChoreo = choreography.find(c => c.id === mappedSlot);
       if (carrierChoreo && carrierChoreo.movements.length > 0) {
         let catchT = 0;
         let minDist = 9999;
         let catchX = 0;
         for (const bk of authoredBallEvents) {
            const ck = carrierChoreo.movements.find(m => m.t === bk.t) || carrierChoreo.movements[0];
            const d = Math.hypot(bk.x - ck.x, bk.y - ck.y);
            if (d < minDist) {
               minDist = d;
               catchT = bk.t;
               catchX = ck.x;
            }
         }
         const targetX = catchX + dir * carryEvent.metres;
         let reachedT = catchT;
         for (const ck of carrierChoreo.movements) {
            if (ck.t >= catchT) {
               if ((dir === 1 && ck.x >= targetX) || (dir === -1 && ck.x <= targetX)) {
                  reachedT = ck.t;
                  break;
               }
               reachedT = ck.t;
            }
         }
         truncateT = reachedT;
       }
    }

    if (truncateT < 1.0) {
      res.events = res.events.filter((e: any) => e.type !== 'BALL_REPOSITIONED' || e.t === undefined || e.t <= truncateT);
      for (const c of choreography) {
         c.movements = c.movements.filter(m => m.t <= truncateT);
      }
    }

    return { ...res, choreography };
`;

code = code.replace('    return { ...res, choreography };', truncateLogic);

fs.writeFileSync(file, code);
console.log('Patched successfully');
