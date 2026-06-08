export interface PhaseAnimatorEntity {
  id: string; // e.g. "h10", "a12", "ball"
  kind: string; // "home", "away", "ball"
  jersey: string; // "10", "12", ""
  kf: { t: number; x: number; y: number }[];
}

export interface PhaseAnimatorExport {
  meta: {
    phase: string;
    beats: { t: number; label: string }[];
    coords?: string;
    generatedBy?: string;
  };
  entities: PhaseAnimatorEntity[];
}

export interface ParsedChoreography {
  authoredNearTop: boolean;
  authoredAttacksTop: boolean;
  authoredAttackingKind: 'home' | 'away';
  authoredAnchorX: number;
  authoredAnchorY: number;
  entities: PhaseAnimatorEntity[];
}

export function parseChoreography(json: PhaseAnimatorExport): ParsedChoreography {
  const ball = json.entities.find(e => e.id === 'ball');
  if (!ball || ball.kf.length === 0) throw new Error("Choreography missing ball");

  // Validate the authored data at module load so a malformed export (out-of-order or
  // out-of-range timestamps, NaN coords, a typo'd id) fails loudly here rather than
  // silently corrupting the WAAPI animation at runtime — `t` is applied as the keyframe
  // `offset`, which must be a number in [0,1] and non-decreasing per entity.
  const phase = json.meta?.phase ?? '?';
  for (const e of json.entities) {
    if (!/^(?:h|a|ball)\d*$/.test(e.id)) throw new Error(`Choreography (${phase}): invalid entity id "${e.id}"`);
    let prevT = -Infinity;
    for (const k of e.kf) {
      if (!Number.isFinite(k.t) || !Number.isFinite(k.x) || !Number.isFinite(k.y))
        throw new Error(`Choreography (${phase}/${e.id}): non-finite keyframe ${JSON.stringify(k)}`);
      if (k.t < 0 || k.t > 1) throw new Error(`Choreography (${phase}/${e.id}): keyframe t=${k.t} outside [0,1]`);
      if (k.t < prevT) throw new Error(`Choreography (${phase}/${e.id}): keyframe t out of order (${prevT} → ${k.t})`);
      prevT = k.t;
    }
  }

  const authoredAnchorX = ball.kf[0].x;
  const authoredAnchorY = ball.kf[0].y;
  const authoredNearTop = authoredAnchorY >= 50;

  // Determine attacking team by who is closest to the ball at t=0 (the scrum-half #9)
  const h9 = json.entities.find(e => e.id === 'h9');
  const a9 = json.entities.find(e => e.id === 'a9');
  
  const distH = h9 ? Math.hypot(h9.kf[0].x - authoredAnchorX, h9.kf[0].y - authoredAnchorY) : 999;
  const distA = a9 ? Math.hypot(a9.kf[0].x - authoredAnchorX, a9.kf[0].y - authoredAnchorY) : 999;
  
  const authoredAttackingKind = distH < distA ? 'home' : 'away';

  // Determine attack direction by looking at attacking #10's depth vs the ball
  // If attacking #10's X is LESS than the ball's X, they are behind it, so they are attacking UP (increasing X).
  const atk10 = json.entities.find(e => e.id === `${authoredAttackingKind.charAt(0)}10`);
  let authoredAttacksTop = true;
  if (atk10) {
    authoredAttacksTop = atk10.kf[0].x < authoredAnchorX;
  }

  return {
    authoredNearTop,
    authoredAttacksTop,
    authoredAttackingKind,
    authoredAnchorX,
    authoredAnchorY,
    entities: json.entities,
  };
}

// Registry of uploaded Phase Animator JSONs, keyed by the lookup the consumer uses:
//  - FirstPhaseEvent.applyChoreography looks up the BARE playType ('crash_ball',
//    'out_the_back', 'kick_decision').
//  - ScrumEvent looks up the prefixed 'SCRUM:wheel' literal directly.
// Match the consumer's key exactly — a prefixed key for a bare-key consumer never
// resolves and the play silently falls back to procedural animation.
export const FIRST_PHASE_CHOREOGRAPHIES: Record<string, ParsedChoreography> = {
  // First-phase plays are looked up by the bare playType in FirstPhaseEvent
  // (applyChoreography: choreoKey = playType), so this must be the bare key — NOT
  // 'SCRUM:kick_decision', which never matched and left the play on procedural fallback.
  'kick_decision': parseChoreography({
  "meta": {
    "phase": "FIRST_PHASE (kick_decision)",
    "beats": [
      {
        "t": 0,
        "label": "start"
      },
      {
        "t": 0.3333333333333333,
        "label": "beat 1"
      },
      {
        "t": 0.6666666666666666,
        "label": "beat 2"
      },
      {
        "t": 1,
        "label": "resolve"
      }
    ],
    "generatedBy": "phase-animator",
    "coords": "game(x:long 0-100 top=100, y:lateral 0-100)"
  },
  "entities": [
    {
      "id": "ball",
      "kind": "ball",
      "jersey": "",
      "kf": [
        {
          "t": 0,
          "x": 50,
          "y": 7.5
        },
        {
          "t": 0.3333,
          "x": 46.24,
          "y": 35.66
        },
        {
          "t": 0.6667,
          "x": 46.8,
          "y": 40.07
        },
        {
          "t": 1,
          "x": 47.04,
          "y": 40.3
        }
      ]
    },
    {
      "id": "h1",
      "kind": "home",
      "jersey": "1",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 25.59
        }
      ]
    },
    {
      "id": "h2",
      "kind": "home",
      "jersey": "2",
      "kf": [
        {
          "t": 0,
          "x": 105.82,
          "y": 25.87
        }
      ]
    },
    {
      "id": "h3",
      "kind": "home",
      "jersey": "3",
      "kf": [
        {
          "t": 0,
          "x": 105.89,
          "y": 25.32
        }
      ]
    },
    {
      "id": "h4",
      "kind": "home",
      "jersey": "4",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 25.37
        }
      ]
    },
    {
      "id": "h5",
      "kind": "home",
      "jersey": "5",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 26.04
        }
      ]
    },
    {
      "id": "h6",
      "kind": "home",
      "jersey": "6",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 25.5
        }
      ]
    },
    {
      "id": "h7",
      "kind": "home",
      "jersey": "7",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 25.26
        }
      ]
    },
    {
      "id": "h8",
      "kind": "home",
      "jersey": "8",
      "kf": [
        {
          "t": 0,
          "x": 105.33,
          "y": 27.85
        }
      ]
    },
    {
      "id": "h9",
      "kind": "home",
      "jersey": "9",
      "kf": [
        {
          "t": 0,
          "x": 47.92,
          "y": 7.81
        },
        {
          "t": 1,
          "x": 47,
          "y": 7.5
        }
      ]
    },
    {
      "id": "h10",
      "kind": "home",
      "jersey": "10",
      "kf": [
        {
          "t": 0,
          "x": 43.55,
          "y": 39.81
        },
        {
          "t": 0.6699,
          "x": 44.53,
          "y": 39.93
        },
        {
          "t": 1,
          "x": 44.9,
          "y": 40.03
        }
      ]
    },
    {
      "id": "h11",
      "kind": "home",
      "jersey": "11",
      "kf": [
        {
          "t": 0,
          "x": 31.1,
          "y": 19.08
        }
      ]
    },
    {
      "id": "h12",
      "kind": "home",
      "jersey": "12",
      "kf": [
        {
          "t": 0,
          "x": 38.32,
          "y": 54.08
        }
      ]
    },
    {
      "id": "h13",
      "kind": "home",
      "jersey": "13",
      "kf": [
        {
          "t": 0,
          "x": 33.75,
          "y": 39.84
        }
      ]
    },
    {
      "id": "h14",
      "kind": "home",
      "jersey": "14",
      "kf": [
        {
          "t": 0,
          "x": 31.27,
          "y": 83.45
        }
      ]
    },
    {
      "id": "h15",
      "kind": "home",
      "jersey": "15",
      "kf": [
        {
          "t": 0,
          "x": 34.61,
          "y": 71.04
        }
      ]
    },
    {
      "id": "a1",
      "kind": "away",
      "jersey": "1",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 0.16
        }
      ]
    },
    {
      "id": "a2",
      "kind": "away",
      "jersey": "2",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 0.3
        }
      ]
    },
    {
      "id": "a3",
      "kind": "away",
      "jersey": "3",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 0
        }
      ]
    },
    {
      "id": "a4",
      "kind": "away",
      "jersey": "4",
      "kf": [
        {
          "t": 0,
          "x": 105.56,
          "y": 0.38
        }
      ]
    },
    {
      "id": "a5",
      "kind": "away",
      "jersey": "5",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 0
        }
      ]
    },
    {
      "id": "a6",
      "kind": "away",
      "jersey": "6",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 0
        }
      ]
    },
    {
      "id": "a7",
      "kind": "away",
      "jersey": "7",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 0
        }
      ]
    },
    {
      "id": "a8",
      "kind": "away",
      "jersey": "8",
      "kf": [
        {
          "t": 0,
          "x": 105.89,
          "y": 0.57
        }
      ]
    },
    {
      "id": "a9",
      "kind": "away",
      "jersey": "9",
      "kf": [
        {
          "t": 0,
          "x": 58.9,
          "y": 7.88
        }
      ]
    },
    {
      "id": "a10",
      "kind": "away",
      "jersey": "10",
      "kf": [
        {
          "t": 0,
          "x": 60.48,
          "y": 38.21
        }
      ]
    },
    {
      "id": "a11",
      "kind": "away",
      "jersey": "11",
      "kf": [
        {
          "t": 0,
          "x": 59.97,
          "y": 84.11
        }
      ]
    },
    {
      "id": "a12",
      "kind": "away",
      "jersey": "12",
      "kf": [
        {
          "t": 0,
          "x": 59.98,
          "y": 53.36
        }
      ]
    },
    {
      "id": "a13",
      "kind": "away",
      "jersey": "13",
      "kf": [
        {
          "t": 0,
          "x": 60.4,
          "y": 68.53
        }
      ]
    },
    {
      "id": "a14",
      "kind": "away",
      "jersey": "14",
      "kf": [
        {
          "t": 0,
          "x": 77.58,
          "y": 23.81
        }
      ]
    },
    {
      "id": "a15",
      "kind": "away",
      "jersey": "15",
      "kf": [
        {
          "t": 0,
          "x": 77.76,
          "y": 69.74
        }
      ]
    }
  ]
}),
  // Example usage (user will populate this):
  // "crash_ball": parseChoreography({ meta: { ... }, entities: [ ... ] }),
  'out_the_back': parseChoreography({
  "meta": {
    "phase": "FIRST_PHASE (out_the_back/out_the_back/line_break/cover_tackle)",
    "beats": [
      {
        "t": 0,
        "label": "start"
      },
      {
        "t": 0.25,
        "label": "beat 1"
      },
      {
        "t": 0.5,
        "label": "beat 2"
      },
      {
        "t": 0.75,
        "label": "beat 3"
      },
      {
        "t": 1,
        "label": "resolve"
      }
    ],
    "generatedBy": "phase-animator",
    "coords": "game(x:long 0-100 top=100, y:lateral 0-100)"
  },
  "entities": [
    {
      "id": "ball",
      "kind": "ball",
      "jersey": "",
      "kf": [
        {
          "t": 0,
          "x": 57,
          "y": 10
        },
        {
          "t": 0.25,
          "x": 51.69,
          "y": 38.83
        },
        {
          "t": 0.5,
          "x": 47.34,
          "y": 50.54
        },
        {
          "t": 0.75,
          "x": 45.55,
          "y": 84.65
        },
        {
          "t": 1,
          "x": 75.08,
          "y": 87.35
        }
      ]
    },
    {
      "id": "h1",
      "kind": "home",
      "jersey": "1",
      "kf": [
        {
          "t": 0,
          "x": -6,
          "y": 0
        }
      ]
    },
    {
      "id": "h2",
      "kind": "home",
      "jersey": "2",
      "kf": [
        {
          "t": 0,
          "x": -6,
          "y": 0
        }
      ]
    },
    {
      "id": "h3",
      "kind": "home",
      "jersey": "3",
      "kf": [
        {
          "t": 0,
          "x": -6,
          "y": 0
        }
      ]
    },
    {
      "id": "h4",
      "kind": "home",
      "jersey": "4",
      "kf": [
        {
          "t": 0,
          "x": -6,
          "y": 0
        }
      ]
    },
    {
      "id": "h5",
      "kind": "home",
      "jersey": "5",
      "kf": [
        {
          "t": 0,
          "x": -6,
          "y": 0
        }
      ]
    },
    {
      "id": "h6",
      "kind": "home",
      "jersey": "6",
      "kf": [
        {
          "t": 0,
          "x": -6,
          "y": 0
        }
      ]
    },
    {
      "id": "h7",
      "kind": "home",
      "jersey": "7",
      "kf": [
        {
          "t": 0,
          "x": -6,
          "y": 0
        }
      ]
    },
    {
      "id": "h8",
      "kind": "home",
      "jersey": "8",
      "kf": [
        {
          "t": 0,
          "x": -6,
          "y": 0
        }
      ]
    },
    {
      "id": "h9",
      "kind": "home",
      "jersey": "9",
      "kf": [
        {
          "t": 0,
          "x": 55.44,
          "y": 9.7
        },
        {
          "t": 0.2471,
          "x": 54.22,
          "y": 17.38
        },
        {
          "t": 1,
          "x": 61.83,
          "y": 72.27
        }
      ]
    },
    {
      "id": "h10",
      "kind": "home",
      "jersey": "10",
      "kf": [
        {
          "t": 0,
          "x": 50.21,
          "y": 38.38
        },
        {
          "t": 0.2501,
          "x": 51.26,
          "y": 38.78
        },
        {
          "t": 1,
          "x": 59.31,
          "y": 40.43
        }
      ]
    },
    {
      "id": "h11",
      "kind": "home",
      "jersey": "11",
      "kf": [
        {
          "t": 0,
          "x": 41.87,
          "y": 23.82
        },
        {
          "t": 0.2499,
          "x": 42.09,
          "y": 32.9
        },
        {
          "t": 0.7589,
          "x": 41.96,
          "y": 52.53
        },
        {
          "t": 0.8702,
          "x": 52.2,
          "y": 67.4
        },
        {
          "t": 1,
          "x": 61.64,
          "y": 80.84
        }
      ]
    },
    {
      "id": "h12",
      "kind": "home",
      "jersey": "12",
      "kf": [
        {
          "t": 0,
          "x": 44.41,
          "y": 56.22
        },
        {
          "t": 0.2547,
          "x": 48.56,
          "y": 50.26
        },
        {
          "t": 0.501,
          "x": 52.39,
          "y": 46.92
        },
        {
          "t": 1,
          "x": 58.71,
          "y": 53.39
        }
      ]
    },
    {
      "id": "h13",
      "kind": "home",
      "jersey": "13",
      "kf": [
        {
          "t": 0,
          "x": 41.61,
          "y": 40.05
        },
        {
          "t": 0.2499,
          "x": 43.03,
          "y": 45.99
        },
        {
          "t": 0.501,
          "x": 46.09,
          "y": 50.32
        },
        {
          "t": 0.7471,
          "x": 50.87,
          "y": 60.09
        },
        {
          "t": 0.8702,
          "x": 56.89,
          "y": 64.16
        }
      ]
    },
    {
      "id": "h14",
      "kind": "home",
      "jersey": "14",
      "kf": [
        {
          "t": 0,
          "x": 33.01,
          "y": 88.17
        },
        {
          "t": 0.2467,
          "x": 38.09,
          "y": 87.58
        },
        {
          "t": 0.4994,
          "x": 40.14,
          "y": 86.18
        },
        {
          "t": 0.7543,
          "x": 45.22,
          "y": 84.24
        },
        {
          "t": 1,
          "x": 74.59,
          "y": 86.43
        }
      ]
    },
    {
      "id": "h15",
      "kind": "home",
      "jersey": "15",
      "kf": [
        {
          "t": 0,
          "x": 39.21,
          "y": 70.63
        },
        {
          "t": 0.2467,
          "x": 40.5,
          "y": 71.49
        },
        {
          "t": 0.504,
          "x": 42.32,
          "y": 71.91
        },
        {
          "t": 0.7568,
          "x": 45.17,
          "y": 77.63
        },
        {
          "t": 0.8702,
          "x": 50.17,
          "y": 85.02
        },
        {
          "t": 1,
          "x": 64.86,
          "y": 90.88
        }
      ]
    },
    {
      "id": "a1",
      "kind": "away",
      "jersey": "1",
      "kf": [
        {
          "t": 0,
          "x": -6,
          "y": 100
        }
      ]
    },
    {
      "id": "a2",
      "kind": "away",
      "jersey": "2",
      "kf": [
        {
          "t": 0,
          "x": -6,
          "y": 100
        }
      ]
    },
    {
      "id": "a3",
      "kind": "away",
      "jersey": "3",
      "kf": [
        {
          "t": 0,
          "x": -6,
          "y": 100
        }
      ]
    },
    {
      "id": "a4",
      "kind": "away",
      "jersey": "4",
      "kf": [
        {
          "t": 0,
          "x": -6,
          "y": 100
        }
      ]
    },
    {
      "id": "a5",
      "kind": "away",
      "jersey": "5",
      "kf": [
        {
          "t": 0,
          "x": -6,
          "y": 100
        }
      ]
    },
    {
      "id": "a6",
      "kind": "away",
      "jersey": "6",
      "kf": [
        {
          "t": 0,
          "x": -6,
          "y": 100
        }
      ]
    },
    {
      "id": "a7",
      "kind": "away",
      "jersey": "7",
      "kf": [
        {
          "t": 0,
          "x": -6,
          "y": 100
        }
      ]
    },
    {
      "id": "a8",
      "kind": "away",
      "jersey": "8",
      "kf": [
        {
          "t": 0,
          "x": -6,
          "y": 100
        }
      ]
    },
    {
      "id": "a9",
      "kind": "away",
      "jersey": "9",
      "kf": [
        {
          "t": 0,
          "x": 65.36,
          "y": 8.82
        },
        {
          "t": 0.2471,
          "x": 63.59,
          "y": 15.29
        },
        {
          "t": 1,
          "x": 72.4,
          "y": 57.45
        }
      ]
    },
    {
      "id": "a10",
      "kind": "away",
      "jersey": "10",
      "kf": [
        {
          "t": 0,
          "x": 65.84,
          "y": 35.95
        },
        {
          "t": 0.2471,
          "x": 62.03,
          "y": 37.62
        },
        {
          "t": 1,
          "x": 66.46,
          "y": 50.76
        }
      ]
    },
    {
      "id": "a11",
      "kind": "away",
      "jersey": "11",
      "kf": [
        {
          "t": 0,
          "x": 64.9,
          "y": 90.56
        },
        {
          "t": 0.2488,
          "x": 66.01,
          "y": 88.98
        },
        {
          "t": 0.5006,
          "x": 66.4,
          "y": 87.36
        },
        {
          "t": 0.7516,
          "x": 67.01,
          "y": 86.48
        },
        {
          "t": 1,
          "x": 75.47,
          "y": 87.04
        }
      ]
    },
    {
      "id": "a12",
      "kind": "away",
      "jersey": "12",
      "kf": [
        {
          "t": 0,
          "x": 65.93,
          "y": 54.84
        },
        {
          "t": 0.2471,
          "x": 61.77,
          "y": 54.32
        },
        {
          "t": 0.5098,
          "x": 56.75,
          "y": 51.54
        },
        {
          "t": 1,
          "x": 65.45,
          "y": 62.43
        }
      ]
    },
    {
      "id": "a13",
      "kind": "away",
      "jersey": "13",
      "kf": [
        {
          "t": 0,
          "x": 66.2,
          "y": 70.67
        },
        {
          "t": 0.2471,
          "x": 62.13,
          "y": 70.61
        },
        {
          "t": 0.5098,
          "x": 56.84,
          "y": 71.25
        },
        {
          "t": 0.7443,
          "x": 50.76,
          "y": 76.77
        },
        {
          "t": 1,
          "x": 68.22,
          "y": 84.77
        }
      ]
    },
    {
      "id": "a14",
      "kind": "away",
      "jersey": "14",
      "kf": [
        {
          "t": 0,
          "x": 81.77,
          "y": 28.74
        },
        {
          "t": 0.7351,
          "x": 80.24,
          "y": 29.18
        },
        {
          "t": 1,
          "x": 85.89,
          "y": 29.97
        }
      ]
    },
    {
      "id": "a15",
      "kind": "away",
      "jersey": "15",
      "kf": [
        {
          "t": 0,
          "x": 81.88,
          "y": 79.94
        },
        {
          "t": 0.7351,
          "x": 78.4,
          "y": 79.57
        },
        {
          "t": 0.9521,
          "x": 83.43,
          "y": 85.11
        }
      ]
    }
  ]
}),
  'crash_ball': parseChoreography({
  "meta": {
    "phase": "FIRST_PHASE (crash_ball/offload_attempt/line_break/cover_tackle)",
    "beats": [
      {
        "t": 0,
        "label": "start"
      },
      {
        "t": 0.3333333333333333,
        "label": "beat 1"
      },
      {
        "t": 0.6666666666666666,
        "label": "beat 2"
      },
      {
        "t": 1,
        "label": "resolve"
      }
    ],
    "generatedBy": "phase-animator",
    "coords": "game(x:long 0-100 top=100, y:lateral 0-100)"
  },
  "entities": [
    {
      "id": "ball",
      "kind": "ball",
      "jersey": "",
      "kf": [
        {
          "t": 0,
          "x": 58,
          "y": 7
        },
        {
          "t": 0.3333,
          "x": 64.8,
          "y": 32.95
        },
        {
          "t": 0.6667,
          "x": 66.82,
          "y": 41.76
        },
        {
          "t": 1,
          "x": 16,
          "y": 43
        }
      ]
    },
    {
      "id": "h1",
      "kind": "home",
      "jersey": "1",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 100
        }
      ]
    },
    {
      "id": "h2",
      "kind": "home",
      "jersey": "2",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 100
        }
      ]
    },
    {
      "id": "h3",
      "kind": "home",
      "jersey": "3",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 100
        }
      ]
    },
    {
      "id": "h4",
      "kind": "home",
      "jersey": "4",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 100
        }
      ]
    },
    {
      "id": "h5",
      "kind": "home",
      "jersey": "5",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 100
        }
      ]
    },
    {
      "id": "h6",
      "kind": "home",
      "jersey": "6",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 100
        }
      ]
    },
    {
      "id": "h7",
      "kind": "home",
      "jersey": "7",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 100
        }
      ]
    },
    {
      "id": "h8",
      "kind": "home",
      "jersey": "8",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 100
        }
      ]
    },
    {
      "id": "h9",
      "kind": "home",
      "jersey": "9",
      "kf": [
        {
          "t": 0,
          "x": 46.11,
          "y": 7.83
        },
        {
          "t": 0.3349,
          "x": 48.64,
          "y": 17.67
        },
        {
          "t": 0.6665,
          "x": 47,
          "y": 29.27
        },
        {
          "t": 1,
          "x": 31.1,
          "y": 30.62
        }
      ]
    },
    {
      "id": "h10",
      "kind": "home",
      "jersey": "10",
      "kf": [
        {
          "t": 0,
          "x": 46.33,
          "y": 33.96
        },
        {
          "t": 0.3325,
          "x": 53.69,
          "y": 33.4
        },
        {
          "t": 0.6646,
          "x": 56.39,
          "y": 33.64
        },
        {
          "t": 1,
          "x": 38.59,
          "y": 33.72
        }
      ]
    },
    {
      "id": "h11",
      "kind": "home",
      "jersey": "11",
      "kf": [
        {
          "t": 0,
          "x": 30.91,
          "y": 30.06
        },
        {
          "t": 0.9752,
          "x": 16.82,
          "y": 38.5
        }
      ]
    },
    {
      "id": "h12",
      "kind": "home",
      "jersey": "12",
      "kf": [
        {
          "t": 0,
          "x": 46.47,
          "y": 44.27
        },
        {
          "t": 0.3325,
          "x": 54.08,
          "y": 45.01
        },
        {
          "t": 0.6646,
          "x": 61.57,
          "y": 49.52
        },
        {
          "t": 1,
          "x": 25.43,
          "y": 56.21
        }
      ]
    },
    {
      "id": "h13",
      "kind": "home",
      "jersey": "13",
      "kf": [
        {
          "t": 0,
          "x": 47.11,
          "y": 63.07
        },
        {
          "t": 0.3325,
          "x": 54.71,
          "y": 61.66
        },
        {
          "t": 0.6646,
          "x": 59.77,
          "y": 61.79
        },
        {
          "t": 1,
          "x": 26.95,
          "y": 66.39
        }
      ]
    },
    {
      "id": "h14",
      "kind": "home",
      "jersey": "14",
      "kf": [
        {
          "t": 0,
          "x": 46.76,
          "y": 83.28
        },
        {
          "t": 0.3325,
          "x": 54.84,
          "y": 83.1
        },
        {
          "t": 0.6646,
          "x": 60.02,
          "y": 83.25
        },
        {
          "t": 1,
          "x": 22.37,
          "y": 85.46
        }
      ]
    },
    {
      "id": "h15",
      "kind": "home",
      "jersey": "15",
      "kf": [
        {
          "t": 0,
          "x": 32.29,
          "y": 76.24
        },
        {
          "t": 0.3341,
          "x": 31.85,
          "y": 77.01
        },
        {
          "t": 0.6649,
          "x": 30.72,
          "y": 76.3
        },
        {
          "t": 1,
          "x": 14.96,
          "y": 43.44
        }
      ]
    },
    {
      "id": "a1",
      "kind": "away",
      "jersey": "1",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 0
        }
      ]
    },
    {
      "id": "a2",
      "kind": "away",
      "jersey": "2",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 0
        }
      ]
    },
    {
      "id": "a3",
      "kind": "away",
      "jersey": "3",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 0
        }
      ]
    },
    {
      "id": "a4",
      "kind": "away",
      "jersey": "4",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 0
        }
      ]
    },
    {
      "id": "a5",
      "kind": "away",
      "jersey": "5",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 0
        }
      ]
    },
    {
      "id": "a6",
      "kind": "away",
      "jersey": "6",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 0
        }
      ]
    },
    {
      "id": "a7",
      "kind": "away",
      "jersey": "7",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 0
        }
      ]
    },
    {
      "id": "a8",
      "kind": "away",
      "jersey": "8",
      "kf": [
        {
          "t": 0,
          "x": 106,
          "y": 0
        }
      ]
    },
    {
      "id": "a9",
      "kind": "away",
      "jersey": "9",
      "kf": [
        {
          "t": 0,
          "x": 59.78,
          "y": 6.67
        },
        {
          "t": 0.3308,
          "x": 54.92,
          "y": 21.23
        },
        {
          "t": 0.6605,
          "x": 53.22,
          "y": 27.92
        },
        {
          "t": 1,
          "x": 25.32,
          "y": 38.4
        }
      ]
    },
    {
      "id": "a10",
      "kind": "away",
      "jersey": "10",
      "kf": [
        {
          "t": 0,
          "x": 67.11,
          "y": 32.93
        },
        {
          "t": 0.3332,
          "x": 65.23,
          "y": 32.64
        },
        {
          "t": 0.6617,
          "x": 65.95,
          "y": 33.33
        },
        {
          "t": 1,
          "x": 46.07,
          "y": 33.34
        }
      ]
    },
    {
      "id": "a11",
      "kind": "away",
      "jersey": "11",
      "kf": [
        {
          "t": 0,
          "x": 80.93,
          "y": 80.72
        },
        {
          "t": 0.3332,
          "x": 78.41,
          "y": 80.98
        },
        {
          "t": 0.6588,
          "x": 71.95,
          "y": 81.39
        },
        {
          "t": 1,
          "x": 37.87,
          "y": 87.28
        }
      ]
    },
    {
      "id": "a12",
      "kind": "away",
      "jersey": "12",
      "kf": [
        {
          "t": 0,
          "x": 72.02,
          "y": 47.73
        },
        {
          "t": 0.3332,
          "x": 69.03,
          "y": 43.71
        },
        {
          "t": 0.6692,
          "x": 66.68,
          "y": 41.74
        },
        {
          "t": 1,
          "x": 15.52,
          "y": 43.14
        }
      ]
    },
    {
      "id": "a13",
      "kind": "away",
      "jersey": "13",
      "kf": [
        {
          "t": 0,
          "x": 76.09,
          "y": 32.56
        },
        {
          "t": 0.3332,
          "x": 74.59,
          "y": 38.27
        },
        {
          "t": 0.6692,
          "x": 71.68,
          "y": 45.39
        },
        {
          "t": 0.7807,
          "x": 66.6,
          "y": 54.34
        },
        {
          "t": 1,
          "x": 44.53,
          "y": 58.8
        }
      ]
    },
    {
      "id": "a14",
      "kind": "away",
      "jersey": "14",
      "kf": [
        {
          "t": 0,
          "x": 76.52,
          "y": 15.45
        },
        {
          "t": 0.3332,
          "x": 75.55,
          "y": 23.92
        },
        {
          "t": 0.6588,
          "x": 73.18,
          "y": 33.82
        },
        {
          "t": 1,
          "x": 46.05,
          "y": 45.98
        }
      ]
    },
    {
      "id": "a15",
      "kind": "away",
      "jersey": "15",
      "kf": [
        {
          "t": 0,
          "x": 77.31,
          "y": 63.29
        },
        {
          "t": 0.3332,
          "x": 73.65,
          "y": 62.16
        },
        {
          "t": 0.6588,
          "x": 70.22,
          "y": 64.13
        },
        {
          "t": 1,
          "x": 37.07,
          "y": 68.61
        }
      ]
    }
  ]
}),

  'SCRUM:wheel': parseChoreography({
  "meta": {
    "phase": "SCRUM (wheel)",
    "beats": [
      {
        "t": 0,
        "label": "start"
      }
    ],
    "generatedBy": "phase-animator",
    "coords": "game(x:long 0-100 top=100, y:lateral 0-100)"
  },
  "entities": [
    {
      "id": "ball",
      "kind": "ball",
      "jersey": "",
      "kf": [
        {
          "t": 0,
          "x": 85,
          "y": 4
        }
      ]
    },
    {
      "id": "h1",
      "kind": "home",
      "jersey": "1",
      "kf": [
        {
          "t": 0,
          "x": 86,
          "y": 3
        }
      ]
    },
    {
      "id": "h2",
      "kind": "home",
      "jersey": "2",
      "kf": [
        {
          "t": 0,
          "x": 86,
          "y": 5
        }
      ]
    },
    {
      "id": "h3",
      "kind": "home",
      "jersey": "3",
      "kf": [
        {
          "t": 0,
          "x": 86,
          "y": 8
        },
        {
          "t": 0.3103,
          "x": 84.15,
          "y": 8.24
        },
        {
          "t": 0.5974,
          "x": 82.93,
          "y": 7.96
        }
      ]
    },
    {
      "id": "h4",
      "kind": "home",
      "jersey": "4",
      "kf": [
        {
          "t": 0,
          "x": 88,
          "y": 4
        }
      ]
    },
    {
      "id": "h5",
      "kind": "home",
      "jersey": "5",
      "kf": [
        {
          "t": 0,
          "x": 88,
          "y": 7
        },
        {
          "t": 0.3103,
          "x": 87.04,
          "y": 8.31
        },
        {
          "t": 0.5974,
          "x": 85.54,
          "y": 8.97
        }
      ]
    },
    {
      "id": "h6",
      "kind": "home",
      "jersey": "6",
      "kf": [
        {
          "t": 0,
          "x": 88,
          "y": 3
        },
        {
          "t": 0.3103,
          "x": 88.91,
          "y": 2.81
        },
        {
          "t": 0.5974,
          "x": 89.48,
          "y": 4.87
        }
      ]
    },
    {
      "id": "h7",
      "kind": "home",
      "jersey": "7",
      "kf": [
        {
          "t": 0,
          "x": 88,
          "y": 10
        },
        {
          "t": 0.3103,
          "x": 85.93,
          "y": 9.46
        },
        {
          "t": 0.5974,
          "x": 84.16,
          "y": 9.45
        }
      ]
    },
    {
      "id": "h8",
      "kind": "home",
      "jersey": "8",
      "kf": [
        {
          "t": 0,
          "x": 90,
          "y": 5
        },
        {
          "t": 0.3103,
          "x": 88.91,
          "y": 6.47
        },
        {
          "t": 0.5974,
          "x": 88.28,
          "y": 7.96
        }
      ]
    },
    {
      "id": "h9",
      "kind": "home",
      "jersey": "9",
      "kf": [
        {
          "t": 0,
          "x": 87,
          "y": 5
        }
      ]
    },
    {
      "id": "h10",
      "kind": "home",
      "jersey": "10",
      "kf": [
        {
          "t": 0,
          "x": 92,
          "y": 37
        }
      ]
    },
    {
      "id": "h11",
      "kind": "home",
      "jersey": "11",
      "kf": [
        {
          "t": 0,
          "x": 98,
          "y": 17
        }
      ]
    },
    {
      "id": "h12",
      "kind": "home",
      "jersey": "12",
      "kf": [
        {
          "t": 0,
          "x": 97,
          "y": 52
        }
      ]
    },
    {
      "id": "h13",
      "kind": "home",
      "jersey": "13",
      "kf": [
        {
          "t": 0,
          "x": 98,
          "y": 37
        }
      ]
    },
    {
      "id": "h14",
      "kind": "home",
      "jersey": "14",
      "kf": [
        {
          "t": 0,
          "x": 98,
          "y": 81
        }
      ]
    },
    {
      "id": "h15",
      "kind": "home",
      "jersey": "15",
      "kf": [
        {
          "t": 0,
          "x": 98,
          "y": 69
        }
      ]
    },
    {
      "id": "a1",
      "kind": "away",
      "jersey": "1",
      "kf": [
        {
          "t": 0,
          "x": 84,
          "y": 3
        },
        {
          "t": 0.3103,
          "x": 83.47,
          "y": 1.27
        },
        {
          "t": 0.5974,
          "x": 84.93,
          "y": 1.09
        }
      ]
    },
    {
      "id": "a2",
      "kind": "away",
      "jersey": "2",
      "kf": [
        {
          "t": 0,
          "x": 84,
          "y": 5
        }
      ]
    },
    {
      "id": "a3",
      "kind": "away",
      "jersey": "3",
      "kf": [
        {
          "t": 0,
          "x": 84,
          "y": 8
        },
        {
          "t": 0.3103,
          "x": 82.54,
          "y": 8.62
        },
        {
          "t": 0.5974,
          "x": 81.76,
          "y": 7.88
        }
      ]
    },
    {
      "id": "a4",
      "kind": "away",
      "jersey": "4",
      "kf": [
        {
          "t": 0,
          "x": 82,
          "y": 4
        }
      ]
    },
    {
      "id": "a5",
      "kind": "away",
      "jersey": "5",
      "kf": [
        {
          "t": 0,
          "x": 82,
          "y": 7
        },
        {
          "t": 0.3103,
          "x": 81.64,
          "y": 6.01
        }
      ]
    },
    {
      "id": "a6",
      "kind": "away",
      "jersey": "6",
      "kf": [
        {
          "t": 0,
          "x": 82,
          "y": 3
        },
        {
          "t": 0.3103,
          "x": 81.35,
          "y": 1.14
        },
        {
          "t": 0.5974,
          "x": 82.43,
          "y": 0.63
        }
      ]
    },
    {
      "id": "a7",
      "kind": "away",
      "jersey": "7",
      "kf": [
        {
          "t": 0,
          "x": 82,
          "y": 10
        },
        {
          "t": 0.3103,
          "x": 80.92,
          "y": 10.08
        },
        {
          "t": 0.5974,
          "x": 80.13,
          "y": 7.87
        }
      ]
    },
    {
      "id": "a8",
      "kind": "away",
      "jersey": "8",
      "kf": [
        {
          "t": 0,
          "x": 80,
          "y": 5
        },
        {
          "t": 0.3103,
          "x": 79.69,
          "y": 3.78
        },
        {
          "t": 0.5974,
          "x": 80.4,
          "y": 2.45
        }
      ]
    },
    {
      "id": "a9",
      "kind": "away",
      "jersey": "9",
      "kf": [
        {
          "t": 0,
          "x": 76,
          "y": 5
        }
      ]
    },
    {
      "id": "a10",
      "kind": "away",
      "jersey": "10",
      "kf": [
        {
          "t": 0,
          "x": 75,
          "y": 36
        }
      ]
    },
    {
      "id": "a11",
      "kind": "away",
      "jersey": "11",
      "kf": [
        {
          "t": 0,
          "x": 75,
          "y": 82
        }
      ]
    },
    {
      "id": "a12",
      "kind": "away",
      "jersey": "12",
      "kf": [
        {
          "t": 0,
          "x": 75,
          "y": 51
        }
      ]
    },
    {
      "id": "a13",
      "kind": "away",
      "jersey": "13",
      "kf": [
        {
          "t": 0,
          "x": 75,
          "y": 66
        }
      ]
    },
    {
      "id": "a14",
      "kind": "away",
      "jersey": "14",
      "kf": [
        {
          "t": 0,
          "x": 57,
          "y": 21
        }
      ]
    },
    {
      "id": "a15",
      "kind": "away",
      "jersey": "15",
      "kf": [
        {
          "t": 0,
          "x": 57,
          "y": 67
        }
      ]
    }
  ]
}),
};
