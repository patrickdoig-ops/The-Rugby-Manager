import { MatchEngine } from './src/engine/MatchEngine';
import { MatchPhase } from './src/types/engine';
const engine = new MatchEngine({ seed: 0x2200, halfTimeMinutes: 40, silent: false });
engine.start();
