import { MatchEngine } from './src/engine/MatchEngine.js';
import { MatchPhase } from './src/types/engine.js';
const engine = new MatchEngine({ seed: 0x2200, halfTimeMinutes: 40 });
engine.eventBus.on('engine:finished', () => {
  console.log("Finished!");
  process.exit(0);
});
engine.initialize();
try {
  let count = 0;
  for (let i = 0; i < 1000; i++) {
    engine.tick();
    if (engine.state.phase === MatchPhase.FullTime) {
      console.log("FullTime reached");
      break;
    }
  }
} catch (e) {
  console.error("CAUGHT ERROR:", e);
}
console.log("DONE LOOPING. Current phase:", engine.state.phase);
