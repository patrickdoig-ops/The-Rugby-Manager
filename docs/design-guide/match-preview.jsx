// Rugby Manager — Match Preview Screen

const LIONS_SQUAD = [
  { n: 1,  name: 'Cole',     pos: 'Loosehead Prop',     ovr: 68, stats: { STM: 69, STR: 88, PAC: 47, AGI: 51, HND: 65, TKL: 80, BRK: 79, KCK: 33, SET: 91 } },
  { n: 2,  name: 'Harker',   pos: 'Hooker',              ovr: 74, stats: { STM: 76, STR: 82, PAC: 64, AGI: 62, HND: 75, TKL: 84, BRK: 82, KCK: 45, SET: 88 } },
  { n: 3,  name: 'Stanton',  pos: 'Tighthead Prop',     ovr: 64, stats: { STM: 66, STR: 94, PAC: 42, AGI: 44, HND: 57, TKL: 78, BRK: 71, KCK: 29, SET: 93 } },
  { n: 4,  name: 'Elliot',   pos: 'Left Lock',           ovr: 70, stats: { STM: 74, STR: 89, PAC: 57, AGI: 53, HND: 64, TKL: 78, BRK: 74, KCK: 38, SET: 90 } },
  { n: 5,  name: 'Thornton', pos: 'Right Lock',          ovr: 72, stats: { STM: 77, STR: 90, PAC: 63, AGI: 58, HND: 69, TKL: 81, BRK: 79, KCK: 41, SET: 86 } },
  { n: 6,  name: 'Price',    pos: 'Blindside Flanker',   ovr: 76, stats: { STM: 88, STR: 85, PAC: 70, AGI: 68, HND: 72, TKL: 88, BRK: 85, KCK: 43, SET: 75 } },
  { n: 7,  name: 'Walsh',    pos: 'Openside Flanker',    ovr: 77, stats: { STM: 92, STR: 76, PAC: 75, AGI: 79, HND: 74, TKL: 87, BRK: 94, KCK: 44, SET: 67 }, captain: true },
  { n: 8,  name: 'Reeves',   pos: 'Number 8',            ovr: 78, stats: { STM: 87, STR: 88, PAC: 77, AGI: 73, HND: 78, TKL: 84, BRK: 83, KCK: 54, SET: 79 } },
  { n: 9,  name: 'Murray',   pos: 'Scrum-Half',          ovr: 79, stats: { STM: 87, STR: 61, PAC: 86, AGI: 89, HND: 90, TKL: 73, BRK: 71, KCK: 80, SET: 63 } },
  { n: 10, name: 'Daly',     pos: 'Fly-Half',            ovr: 77, stats: { STM: 79, STR: 62, PAC: 76, AGI: 80, HND: 88, TKL: 62, BRK: 59, KCK: 92, SET: 56 } },
  { n: 11, name: 'Barnett',  pos: 'Left Wing',           ovr: 72, stats: { STM: 80, STR: 68, PAC: 96, AGI: 92, HND: 79, TKL: 63, BRK: 57, KCK: 62, SET: 51 } },
  { n: 12, name: 'Foster',   pos: 'Inside Centre',       ovr: 78, stats: { STM: 85, STR: 83, PAC: 78, AGI: 76, HND: 83, TKL: 85, BRK: 76, KCK: 65, SET: 60 } },
  { n: 13, name: 'Spencer',  pos: 'Outside Centre',      ovr: 75, stats: { STM: 82, STR: 76, PAC: 84, AGI: 82, HND: 86, TKL: 78, BRK: 70, KCK: 58, SET: 55 } },
];

function MatchPreview() {
  const [tab, setTab] = React.useState('LNS');
  const [view, setView] = React.useState('list'); // 'list' | 'pitch'

  return (
    <div className="rm" style={{
      width: '100%', height: '100%',
      background: 'var(--rm-bg)',
      display: 'flex', flexDirection: 'column',
      paddingTop: 56,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* — Hero header — */}
      <div style={{ padding: '8px 20px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <button style={{
            appearance: 'none', border: 'none', background: 'transparent', cursor: 'pointer',
            color: 'var(--rm-text-muted)', display: 'flex', alignItems: 'center', gap: 4,
            padding: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span className="mono" style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Lobby</span>
          </button>
          <span className="mono" style={{ fontSize: 10, letterSpacing: '0.18em', color: 'var(--rm-text-dim)', textTransform: 'uppercase' }}>
            Match Preview · Round 14
          </span>
          <div style={{ width: 60 }} />
        </div>

        {/* Versus block */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center', gap: 12,
          padding: '14px 12px',
          borderRadius: 14,
          background: `linear-gradient(135deg,
            color-mix(in oklch, var(--rm-team-a) 14%, var(--rm-surface)) 0%,
            var(--rm-surface) 50%,
            color-mix(in oklch, var(--rm-team-b) 14%, var(--rm-surface)) 100%)`,
          border: '1px solid var(--rm-hairline)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Crest code="L" color="var(--rm-team-a)" size={48} />
            <div>
              <div className="disp" style={{ fontSize: 26, color: 'var(--rm-chalk)', lineHeight: 1, letterSpacing: '0.02em' }}>LNS</div>
              <div style={{ fontSize: 11, color: 'var(--rm-text-muted)', marginTop: 2 }}>The Lions</div>
              <div style={{ display: 'flex', gap: 3, marginTop: 5 }}>
                {'WWLWD'.split('').map((r, i) => <FormPin key={i} r={r} />)}
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center', padding: '0 4px' }}>
            <span className="ed" style={{ fontSize: 28, color: 'var(--rm-text-dim)', fontStyle: 'italic' }}>vs</span>
            <div className="mono" style={{ fontSize: 9, letterSpacing: '0.2em', color: 'var(--rm-amber)', marginTop: 2 }}>
              20:00
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
            <div style={{ textAlign: 'right' }}>
              <div className="disp" style={{ fontSize: 26, color: 'var(--rm-chalk)', lineHeight: 1, letterSpacing: '0.02em' }}>EGL</div>
              <div style={{ fontSize: 11, color: 'var(--rm-text-muted)', marginTop: 2 }}>The Eagles</div>
              <div style={{ display: 'flex', gap: 3, marginTop: 5, justifyContent: 'flex-end' }}>
                {'WWWLW'.split('').map((r, i) => <FormPin key={i} r={r} />)}
              </div>
            </div>
            <Crest code="E" color="var(--rm-team-b)" size={48} />
          </div>
        </div>

        {/* Stake row */}
        <div style={{
          marginTop: 10,
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6,
        }}>
          {[
            ['LEAGUE', '2nd', '4 pts'],
            ['H2H',    '1W · 2L', 'last 3'],
            ['ODDS',   '+3.5',    'EGL fav.'],
          ].map(([k, v, sub]) => (
            <div key={k} style={{
              padding: '8px 10px', borderRadius: 8,
              background: 'var(--rm-surface)',
              border: '1px solid var(--rm-hairline)',
            }}>
              <div className="mono" style={{ fontSize: 8.5, letterSpacing: '0.16em', color: 'var(--rm-text-dim)' }}>{k}</div>
              <div className="mono num" style={{ fontSize: 14, color: 'var(--rm-chalk)', fontWeight: 600, marginTop: 1 }}>{v}</div>
              <div className="mono" style={{ fontSize: 9, color: 'var(--rm-text-muted)', marginTop: 1 }}>{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        padding: '0 20px',
        borderBottom: '1px solid var(--rm-hairline)',
      }}>
        {[
          { id: 'LNS',     label: 'The Lions',  color: 'var(--rm-team-a)' },
          { id: 'EGL',     label: 'The Eagles', color: 'var(--rm-team-b)' },
          { id: 'TACTICS', label: 'Tactics',    color: 'var(--rm-pitch)' },
        ].map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                appearance: 'none', border: 'none', background: 'transparent', cursor: 'pointer',
                padding: '14px 0', marginRight: 18,
                position: 'relative',
                color: active ? 'var(--rm-chalk)' : 'var(--rm-text-dim)',
                fontFamily: 'var(--rm-font-body)',
                fontSize: 14, fontWeight: active ? 600 : 500,
              }}
            >
              {t.label}
              {active && <div style={{
                position: 'absolute', bottom: -1, left: 0, right: 0, height: 2,
                background: t.color, borderRadius: 1,
                boxShadow: `0 0 8px ${t.color}`,
              }} />}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', background: 'var(--rm-surface)', borderRadius: 8, padding: 2 }}>
          {[
            { id: 'list',  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg> },
            { id: 'pitch', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="6" width="18" height="12" rx="1" /><path d="M12 6v12" /></svg> },
          ].map(v => (
            <button key={v.id}
              onClick={() => setView(v.id)}
              style={{
                appearance: 'none', border: 'none', cursor: 'pointer',
                padding: '6px 10px', borderRadius: 6,
                background: view === v.id ? 'var(--rm-surface-3)' : 'transparent',
                color: view === v.id ? 'var(--rm-chalk)' : 'var(--rm-text-dim)',
                display: 'flex', alignItems: 'center',
              }}
            >{v.icon}</button>
          ))}
        </div>
      </div>

      {/* Roster */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px 100px', position: 'relative' }}>
        {tab === 'TACTICS' ? (
          <TacticsPanel />
        ) : view === 'pitch' ? (
          <PitchFormation team={tab} />
        ) : (
          <RosterList team={tab} />
        )}
      </div>

      {/* Sticky kickoff bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '12px 20px 32px',
        background: 'linear-gradient(180deg, transparent 0%, var(--rm-bg) 30%)',
        zIndex: 10,
      }}>
        <button style={{
          appearance: 'none', border: 'none', cursor: 'pointer', width: '100%',
          padding: '16px 18px',
          background: 'var(--rm-pitch)',
          color: 'var(--rm-bg-deep)',
          borderRadius: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 14px 36px color-mix(in oklch, var(--rm-pitch) 32%, transparent), inset 0 1px 0 rgba(255,255,255,0.3)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BallMark size={22} color="var(--rm-bg-deep)" />
            <span className="disp" style={{ fontSize: 26, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Kick Off</span>
          </div>
          <span className="mono" style={{ fontSize: 11, letterSpacing: '0.16em', fontWeight: 600, opacity: 0.75 }}>R14 · 80′</span>
        </button>
      </div>
    </div>
  );
}

// — Roster list (compact, scannable) —
function RosterList({ team }) {
  const teamColor = team === 'LNS' ? 'var(--rm-team-a)' : 'var(--rm-team-b)';
  const squad = LIONS_SQUAD;
  const STATS = ['STM', 'STR', 'PAC', 'AGI', 'HND', 'TKL', 'BRK', 'KCK', 'SET'];

  return (
    <>
      {/* Column header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '22px 1fr 28px 4px repeat(9, 22px)',
        gap: 2, alignItems: 'center',
        padding: '6px 8px',
        position: 'sticky', top: 0, zIndex: 1,
        background: 'color-mix(in oklch, var(--rm-bg) 92%, transparent)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}>
        <div />
        <div />
        <div className="mono" style={{ fontSize: 9, letterSpacing: '0.08em', color: 'var(--rm-text-dim)', textAlign: 'center' }}>OVR</div>
        <div />
        {STATS.map(s => (
          <div key={s} className="mono" style={{ fontSize: 8, letterSpacing: '0.05em', color: 'var(--rm-text-dim)', textAlign: 'center' }}>{s}</div>
        ))}
      </div>

      {squad.map(p => (
        <div key={p.n} style={{
          display: 'grid',
          gridTemplateColumns: '22px 1fr 28px 4px repeat(9, 22px)',
          gap: 2, alignItems: 'center',
          padding: '8px 8px',
          borderRadius: 8,
          marginBottom: 2,
          background: 'transparent',
          borderTop: '1px solid var(--rm-hairline)',
        }}>
          <div className="mono num" style={{
            fontSize: 12, color: teamColor, fontWeight: 600, textAlign: 'center',
          }}>{p.n}</div>

          <div style={{ minWidth: 0, paddingLeft: 4 }}>
            <div style={{
              fontSize: 13, fontWeight: 600, color: 'var(--rm-chalk)', lineHeight: 1.1,
              display: 'flex', alignItems: 'center', gap: 5,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {p.name}
              {p.captain && (
                <span className="mono" style={{
                  fontSize: 8, letterSpacing: '0.1em',
                  padding: '1px 4px', borderRadius: 3,
                  background: 'color-mix(in oklch, var(--rm-amber) 22%, transparent)',
                  color: 'var(--rm-amber)',
                  border: '1px solid color-mix(in oklch, var(--rm-amber) 40%, transparent)',
                }}>C</span>
              )}
            </div>
            <div className="mono" style={{
              fontSize: 9, letterSpacing: '0.06em', color: 'var(--rm-text-dim)',
              textTransform: 'uppercase', marginTop: 1,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{p.pos}</div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <span className="mono num" style={{
              fontSize: 13, fontWeight: 700, color: statColor(p.ovr),
            }}>{p.ovr}</span>
          </div>

          <div style={{ width: 1, height: 22, background: 'var(--rm-hairline)', justifySelf: 'center' }} />

          {['STM','STR','PAC','AGI','HND','TKL','BRK','KCK','SET'].map(k => (
            <div key={k} className="mono num" style={{
              fontSize: 11, fontWeight: 500, textAlign: 'center',
              color: statColor(p.stats[k]),
            }}>{p.stats[k]}</div>
          ))}
        </div>
      ))}
    </>
  );
}

// — Pitch formation (1-3-3-1) —
function PitchFormation({ team }) {
  const teamColor = team === 'LNS' ? 'var(--rm-team-a)' : 'var(--rm-team-b)';
  const rows = [
    { y: 14, players: [{ n: 11, name: 'Barnett' }, { n: 13, name: 'Spencer' }, { n: 14, name: 'Hayes' }] },
    { y: 30, players: [{ n: 10, name: 'Daly' }, { n: 12, name: 'Foster' }] },
    { y: 46, players: [{ n: 9, name: 'Murray' }, { n: 15, name: 'Quinn' }] },
    { y: 62, players: [{ n: 6, name: 'Price' }, { n: 8, name: 'Reeves' }, { n: 7, name: 'Walsh' }] },
    { y: 78, players: [{ n: 4, name: 'Elliot' }, { n: 5, name: 'Thornton' }] },
    { y: 92, players: [{ n: 1, name: 'Cole' }, { n: 2, name: 'Harker' }, { n: 3, name: 'Stanton' }] },
  ];

  return (
    <div style={{
      position: 'relative', borderRadius: 16, overflow: 'hidden',
      height: 580, margin: '8px 0',
      background: `
        radial-gradient(120% 80% at 50% 0%, color-mix(in oklch, var(--rm-pitch) 12%, transparent) 0%, transparent 60%),
        repeating-linear-gradient(0deg,
          color-mix(in oklch, var(--rm-pitch-deep) 60%, var(--rm-bg-deep)) 0px,
          color-mix(in oklch, var(--rm-pitch-deep) 60%, var(--rm-bg-deep)) 28px,
          color-mix(in oklch, var(--rm-pitch-deep) 75%, var(--rm-bg-deep)) 28px,
          color-mix(in oklch, var(--rm-pitch-deep) 75%, var(--rm-bg-deep)) 56px)`,
      border: '1px solid var(--rm-hairline)',
    }}>
      {/* lines */}
      <div style={{ position: 'absolute', top: '8%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.5)' }} />
      <div style={{ position: 'absolute', bottom: '8%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.5)' }} />
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.7)' }} />

      {rows.flatMap(r => r.players.map((pl, i) => {
        const x = ((i + 1) / (r.players.length + 1)) * 100;
        return (
          <div key={`${r.y}-${pl.n}`} style={{
            position: 'absolute', top: `${r.y}%`, left: `${x}%`,
            transform: 'translate(-50%, -50%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: `linear-gradient(180deg, ${teamColor} 0%, color-mix(in oklch, ${teamColor} 60%, black) 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--rm-chalk)', fontFamily: 'var(--rm-font-mono)', fontWeight: 700, fontSize: 13,
              border: '1.5px solid var(--rm-chalk)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}>{pl.n}</div>
            <div style={{
              fontSize: 10, fontWeight: 600, color: 'var(--rm-chalk)',
              textShadow: '0 1px 4px rgba(0,0,0,0.8)',
            }}>{pl.name}</div>
          </div>
        );
      }))}
    </div>
  );
}

// — Tactics panel —
function TacticsPanel() {
  const [style, setStyle] = React.useState('balanced');
  const sliders = [
    { id: 'depth',    label: 'Defensive Line',  l: 'Up',     r: 'Drift',    val: 0.65 },
    { id: 'phase',    label: 'Phase Play',       l: 'Forward', r: 'Wide',     val: 0.42 },
    { id: 'kicking',  label: 'Kicking Strategy', l: 'Box',    r: 'Territory',val: 0.78 },
    { id: 'breakdown',label: 'Breakdown',        l: 'Quick',  r: 'Slow',     val: 0.35 },
  ];

  return (
    <div style={{ padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Eyebrow>Game Plan</Eyebrow>
      <div style={{ display: 'flex', gap: 6 }}>
        {['conservative','balanced','expansive'].map(s => (
          <button key={s} onClick={() => setStyle(s)} style={{
            flex: 1, appearance: 'none', cursor: 'pointer', padding: '12px 8px',
            borderRadius: 10,
            background: style === s ? 'color-mix(in oklch, var(--rm-pitch) 18%, var(--rm-surface))' : 'var(--rm-surface)',
            border: `1px solid ${style === s ? 'var(--rm-pitch)' : 'var(--rm-hairline)'}`,
            color: style === s ? 'var(--rm-chalk)' : 'var(--rm-text-muted)',
            fontFamily: 'var(--rm-font-body)', fontSize: 11, fontWeight: 600,
            textTransform: 'capitalize',
          }}>{s}</button>
        ))}
      </div>

      <Eyebrow>Match Settings</Eyebrow>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {sliders.map(s => (
          <div key={s.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div className="mono" style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--rm-text-muted)', textTransform: 'uppercase' }}>{s.label}</div>
              <div className="mono num" style={{ fontSize: 10, color: 'var(--rm-pitch)' }}>{Math.round(s.val * 100)}%</div>
            </div>
            <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'var(--rm-surface-2)' }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: `${s.val * 100}%`, borderRadius: 3,
                background: 'linear-gradient(90deg, var(--rm-pitch-deep), var(--rm-pitch))',
                boxShadow: '0 0 12px color-mix(in oklch, var(--rm-pitch) 50%, transparent)',
              }} />
              <div style={{
                position: 'absolute', top: '50%', left: `${s.val * 100}%`,
                width: 14, height: 14, borderRadius: '50%',
                background: 'var(--rm-chalk)',
                transform: 'translate(-50%, -50%)',
                border: '2px solid var(--rm-pitch)',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span className="mono" style={{ fontSize: 9, color: 'var(--rm-text-dim)' }}>{s.l}</span>
              <span className="mono" style={{ fontSize: 9, color: 'var(--rm-text-dim)' }}>{s.r}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { MatchPreview });
