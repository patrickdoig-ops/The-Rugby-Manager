const fs = require('fs');
const tsConfig = require('./tsconfig.json');
require('ts-node').register({
  compilerOptions: { module: 'commonjs' }
});

const { FIRST_PHASE_CHOREOGRAPHIES } = require('./src/engine/balance/firstPhaseChoreography');

const c = FIRST_PHASE_CHOREOGRAPHIES['crash_ball'];
const ball = c.entities.find(e => e.id === 'ball');
const h10 = c.entities.find(e => e.id === 'h10' || e.id === 'a10');
const h12 = c.entities.find(e => e.id === 'h12' || e.id === 'a12');

console.log('Ball frames:', ball.kf.length);

function checkDist(player, name) {
    let minT = 0, minDist = 9999;
    for (const bk of ball.kf) {
        const pk = player.kf.find(k => k.t === bk.t) || player.kf[0];
        const d = Math.hypot(bk.x - pk.x, bk.y - pk.y);
        if (d < minDist) {
            minDist = d;
            minT = bk.t;
        }
    }
    console.log(name, 'minDist:', minDist, 'at minT:', minT);
}
checkDist(h10, 'Fly Half (#10)');
checkDist(h12, 'Inside Centre (#12)');
