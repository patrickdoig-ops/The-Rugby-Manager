import { MatchCoordinator } from './src/engine/MatchCoordinator';
import { RawTeamInput } from './src/types/team';

const homeTeam: RawTeamInput = {
  id: 1, name: "Home", color: "red", secondaryColor: "white",
  players: Array.from({length: 15}, (_, i) => ({
    id: i+1, firstName: "H", lastName: "P"+(i+1), position: "Prop",
    baseStats: { handling: 50, passing: 50, tackling: 50, breakdown: 50, carrying: 50, scrummaging: 50, lineout: 50, kicking: 50, discipline: 50, pace: 50, strength: 50, fitness: 50 }
  })), bench: []
};
const awayTeam: RawTeamInput = {
  id: 2, name: "Away", color: "blue", secondaryColor: "white",
  players: Array.from({length: 15}, (_, i) => ({
    id: i+1, firstName: "A", lastName: "P"+(i+1), position: "Prop",
    baseStats: { handling: 50, passing: 50, tackling: 50, breakdown: 50, carrying: 50, scrummaging: 50, lineout: 50, kicking: 50, discipline: 50, pace: 50, strength: 50, fitness: 50 }
  })), bench: []
};

const coord = new MatchCoordinator(homeTeam, awayTeam, { seed: 0x2200, silent: true });
try {
  coord.initialize();
  coord.start();
  console.log("FINISHED WITHOUT ERROR");
} catch (e) {
  console.log("ERROR OCCURRED:", e.message, e.stack);
}
