import { eventBus } from '../utils/eventBus';
import type { MatchState } from '../types/match';
import type { Team } from '../types/team';
import { MatchPhase, type PossessionSide } from '../types/engine';

interface Vec2 { x: number; y: number; }

// Formation positions: relative coords 0–1 (x=0 home try-line, x=1 away try-line, y=0 left, y=1 right)
// Each formation is { [jerseyNumber]: {x,y} }
type Formation = Record<number, Vec2>;

function homeAttackFormation(bx: number): Formation {
  const b = bx / 100;
  return {
    1: { x: b - 0.03, y: 0.45 }, 2: { x: b - 0.02, y: 0.50 }, 3: { x: b - 0.03, y: 0.55 },
    4: { x: b - 0.05, y: 0.47 }, 5: { x: b - 0.05, y: 0.53 },
    6: { x: b - 0.07, y: 0.35 }, 7: { x: b - 0.07, y: 0.65 }, 8: { x: b - 0.06, y: 0.50 },
    9: { x: b + 0.01, y: 0.43 }, 10: { x: b + 0.04, y: 0.32 },
    12: { x: b + 0.06, y: 0.38 }, 13: { x: b + 0.08, y: 0.55 },
    11: { x: b + 0.10, y: 0.12 }, 14: { x: b + 0.10, y: 0.88 }, 15: { x: b - 0.12, y: 0.50 },
  };
}

function awayDefenceFormation(bx: number): Formation {
  const b = bx / 100;
  return {
    1: { x: b + 0.04, y: 0.42 }, 2: { x: b + 0.04, y: 0.50 }, 3: { x: b + 0.04, y: 0.58 },
    4: { x: b + 0.06, y: 0.44 }, 5: { x: b + 0.06, y: 0.56 },
    6: { x: b + 0.05, y: 0.33 }, 7: { x: b + 0.05, y: 0.67 }, 8: { x: b + 0.07, y: 0.50 },
    9: { x: b + 0.02, y: 0.50 }, 10: { x: b + 0.08, y: 0.32 },
    12: { x: b + 0.09, y: 0.40 }, 13: { x: b + 0.09, y: 0.60 },
    11: { x: b + 0.11, y: 0.15 }, 14: { x: b + 0.11, y: 0.85 }, 15: { x: b + 0.18, y: 0.50 },
  };
}

function scrumFormation(bx: number, by: number, isAttacking: boolean): Formation {
  const x = bx / 100;
  const y = by / 100;
  const dx = isAttacking ? -0.02 : 0.02;
  return {
    1: { x: x + dx, y: y - 0.03 }, 2: { x: x + dx, y }, 3: { x: x + dx, y: y + 0.03 },
    4: { x: x + dx * 2, y: y - 0.015 }, 5: { x: x + dx * 2, y: y + 0.015 },
    6: { x: x + dx * 2.5, y: y - 0.04 }, 7: { x: x + dx * 2.5, y: y + 0.04 }, 8: { x: x + dx * 3, y },
    9: { x: x + (isAttacking ? 0.03 : -0.03), y },
    10: { x: x + (isAttacking ? 0.06 : -0.06), y: y - 0.08 },
    12: { x: x + (isAttacking ? 0.08 : -0.08), y: y - 0.05 },
    13: { x: x + (isAttacking ? 0.08 : -0.08), y: y + 0.07 },
    11: { x: x + (isAttacking ? 0.12 : -0.12), y: y - 0.15 },
    14: { x: x + (isAttacking ? 0.12 : -0.12), y: y + 0.15 },
    15: { x: x + (isAttacking ? -0.12 : 0.12), y },
  };
}

function lineoutFormation(bx: number, attacking: boolean): Formation {
  const x = bx / 100;
  const touchY = 0.02;
  const dx = attacking ? -0.03 : 0.03;
  return {
    2: { x, y: touchY + 0.01 },
    4: { x, y: touchY + 0.06 }, 5: { x, y: touchY + 0.10 }, 6: { x, y: touchY + 0.14 },
    7: { x, y: touchY + 0.18 }, 8: { x, y: touchY + 0.22 },
    1: { x: x + dx, y: touchY + 0.03 }, 3: { x: x + dx, y: touchY + 0.08 },
    9: { x: x + dx * 2, y: touchY + 0.12 },
    10: { x: x + dx * 3, y: touchY + 0.20 },
    12: { x: x + dx * 4, y: touchY + 0.28 },
    13: { x: x + dx * 5, y: touchY + 0.35 },
    11: { x: x + dx * 6, y: touchY + 0.15 },
    14: { x: x + dx * 6, y: touchY + 0.45 },
    15: { x: x + (attacking ? -0.15 : 0.15), y: 0.50 },
  };
}

function getFormation(team: Team, isHome: boolean, phase: MatchPhase, possession: PossessionSide, ballX: number, ballY: number): Formation {
  const isAttacking = (isHome && possession === 'home') || (!isHome && possession === 'away');

  switch (phase) {
    case MatchPhase.Scrum:
      return scrumFormation(ballX, ballY, isAttacking);
    case MatchPhase.Lineout:
      return lineoutFormation(ballX, isAttacking);
    default:
      return isAttacking ? homeAttackFormation(ballX) : awayDefenceFormation(ballX);
  }
}

export class PitchRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private currentState: MatchState | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  private resizeCanvas(): void {
    const parent = this.canvas.parentElement!;
    this.canvas.width  = parent.clientWidth;
    this.canvas.height = parent.clientHeight;
    if (this.currentState) this.render(this.currentState);
  }

  subscribe(): void {
    eventBus.on('engine:stateChange', ({ state }) => {
      this.currentState = state;
      this.render(state);
    });
  }

  render(state: MatchState): void {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    this.drawPitch(W, H);
    this.drawGainLine(W, H, state.ballX);
    this.drawPlayers(W, H, state);
    this.drawBall(W, H, state.ballX, state.ballY);
  }

  private toCanvas(relX: number, relY: number, W: number, H: number): Vec2 {
    return { x: relX * W, y: relY * H };
  }

  private drawPitch(W: number, H: number): void {
    const { ctx } = this;

    // Field
    ctx.fillStyle = '#2d7a2d';
    ctx.fillRect(0, 0, W, H);

    // Alternating stripes
    for (let i = 0; i < 10; i++) {
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(i * W / 10, 0, W / 10, H);
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth   = 2;

    const lines = [0.05, 0.22, 0.27, 0.50, 0.73, 0.78, 0.95]; // relative X positions
    for (const rx of lines) {
      const x = rx * W;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }

    // Try zones shading
    ctx.fillStyle = 'rgba(100,200,100,0.15)';
    ctx.fillRect(0, 0, 0.05 * W, H);
    ctx.fillRect(0.95 * W, 0, 0.05 * W, H);

    // Labels
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `${Math.max(10, W * 0.012)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('22', 0.22 * W, 12);
    ctx.fillText('HW', 0.50 * W, 12);
    ctx.fillText('22', 0.78 * W, 12);

    // Touchlines
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.strokeRect(0.05 * W, 2, 0.90 * W, H - 4);
  }

  private drawGainLine(W: number, H: number, ballX: number): void {
    const { ctx } = this;
    const x = (ballX / 100) * W;
    ctx.save();
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    ctx.restore();
  }

  private drawPlayers(W: number, H: number, state: MatchState): void {
    const { homeTeam, awayTeam, phase, possession, ballX, ballY } = state;

    const drawTeam = (team: Team, isHome: boolean) => {
      const formation = getFormation(team, isHome, phase, possession, ballX, ballY);
      for (const player of team.players) {
        const pos = formation[player.id];
        if (!pos) continue;
        const cx = clamp(pos.x, 0.02, 0.98) * W;
        const cy = clamp(pos.y, 0.02, 0.98) * H;

        const radius = Math.max(10, W * 0.018);
        const fatigueAlpha = 0.5 + (player.fatiguePct / 100) * 0.5;

        // Shadow
        this.ctx.save();
        this.ctx.shadowBlur = 4;
        this.ctx.shadowColor = 'rgba(0,0,0,0.4)';

        // Circle
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        this.ctx.fillStyle = team.color;
        this.ctx.globalAlpha = fatigueAlpha;
        this.ctx.fill();
        this.ctx.strokeStyle = team.secondaryColor;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        this.ctx.restore();

        // Number
        this.ctx.fillStyle = '#fff';
        this.ctx.font = `bold ${Math.max(9, radius * 0.9)}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(String(player.id), cx, cy);
      }
    };

    drawTeam(homeTeam, true);
    drawTeam(awayTeam, false);
    this.ctx.textBaseline = 'alphabetic';
  }

  private drawBall(W: number, H: number, ballX: number, ballY: number): void {
    const { ctx } = this;
    const cx = (ballX / 100) * W;
    const cy = (ballY / 100) * H;
    const rw = Math.max(8, W * 0.012);
    const rh = rw * 0.65;

    ctx.save();
    ctx.shadowBlur = 6;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';

    ctx.fillStyle = '#a0522d';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - rw * 0.5, cy);
    ctx.lineTo(cx + rw * 0.5, cy);
    ctx.stroke();

    ctx.restore();
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
