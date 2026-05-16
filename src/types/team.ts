import type { Player } from './player';

export type TeamSide = 'home' | 'away';

export interface Team {
  id: string;
  name: string;
  shortName: string;
  color: string;
  secondaryColor: string;
  players: Player[];
}
