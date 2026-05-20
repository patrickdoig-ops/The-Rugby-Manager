// Rugby Manager — Live Match: Body (commentary, stats, player ratings)

const COMMENTARY = [
  { m: 72, kind: 'live',    text: <>The Eagles drive at the ruck — <strong style={{ color: 'var(--rm-chalk)' }}>Murray</strong> snipes around the fringe…</> },
  { m: 71, kind: 'penalty', text: <>Penalty Eagles, offside at the breakdown. <strong style={{ color: 'var(--rm-chalk)' }}>Hayes</strong> lines it up.</> },
  { m: 68, kind: 'try',     text: <><strong style={{ color: 'var(--rm-team-b)' }}>Try, Eagles!</strong> Quick hands wide — Bell finishes in the corner.</> },
  { m: 64, kind: 'card',    text: <>Yellow card to <strong style={{ color: 'var(--rm-chalk)' }}>Thornton</strong> — cynical offside in the 22.</> },
  { m: 58, kind: 'sub',     text: <>Sub for the Lions: <strong style={{ color: 'var(--rm-chalk)' }}>Spencer</strong> on for Foster.</> },
  { m: 50, kind: 'live',    text: <>Half-time whistle. Lions lead by four; tight, scrappy contest.</> },
];

const COMMENTARY_TONES = {
  live:    { c: 'var(--rm-text)', tag: '·', tagC: 'var(--rm-text-dim)' },
  try:     { c: 'var(--rm-chalk)', tag: 'TRY', tagC: 'var(--rm-pitch)' },
  penalty: { c: 'var(--rm-text)', tag: 'PEN', tagC: 'var(--rm-amber)' },
  card:    { c: 'var(--rm-text)', tag: 'CARD', tagC: 'var(--rm-stat-1)' },
  sub:     { c: 'var(--rm-text-muted)', tag: 'SUB', tagC: 'var(--rm-text-dim)' },
};

function Commentary() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {COMMENTARY.map((e, i) => {
        const t = COMMENTARY_TONES[e.kind];
        const isLive = i === 0;
        return (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '32px 36px 1fr',
            gap: 8, padding: '10px 0',
            borderBottom: '1px solid var(--rm-hairline)',
          }}>
            <div className="mono num" style={{
              fontSize: 11, color: isLive ? 'var(--rm-pitch)' : 'var(--rm-text-dim)',
              fontWeight: isLive ? 700 : 500,
              paddingTop: 1,
            }}>{e.m}′</div>
            <div className="mono" style={{
              fontSize: 8.5, letterSpacing: '0.14em', color: t.tagC,
              fontWeight: 700, paddingTop: 3, textTransform: 'uppercase',
            }}>{t.tag}</div>
            <div style={{
              fontSize: 13, lineHeight: 1.45, color: t.c,
              fontFamily: e.kind === 'try' ? 'var(--rm-font-editor)' : 'var(--rm-font-body)',
              fontStyle: e.kind === 'try' ? 'italic' : 'normal',
              ...(e.kind === 'try' && { fontSize: 17 }),
            }}>{e.text}</div>
          </div>
        );
      })}
    </div>
  );
}

const MATCH_STATS = [
  { k: 'Possession',  a: 47, b: 53, unit: '%' },
  { k: 'Territory',   a: 41, b: 59, unit: '%' },
  { k: 'Tackle %',    a: 88, b: 91, unit: '%' },
  { k: 'Carries',     a: 78, b: 84, unit: '' },
  { k: 'Errors',      a: 6,  b: 4,  unit: '', invert: true },
  { k: 'Tries',       a: 2,  b: 2,  unit: '' },
  { k: 'Scrums',      a: 4,  b: 5,  unit: '' },
  { k: 'Lineouts',    a: 7,  b: 6,  unit: '' },
];

function MatchStats() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {MATCH_STATS.map(s => {
        const tot = s.a + s.b;
        const aPct = tot ? (s.a / tot) * 100 : 50;
        const bPct = tot ? (s.b / tot) * 100 : 50;
        const aWin = s.invert ? s.a < s.b : s.a > s.b;
        const bWin = s.invert ? s.b < s.a : s.b > s.a;
        return (
          <div key={s.k}>
            <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 36px',
              alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <span className="mono num" style={{
                fontSize: 13, fontWeight: 700, textAlign: 'right',
                color: aWin ? 'var(--rm-chalk)' : 'var(--rm-text-muted)',
              }}>{s.a}{s.unit}</span>
              <div className="mono" style={{
                fontSize: 9, letterSpacing: '0.16em', color: 'var(--rm-text-dim)',
                textAlign: 'center', textTransform: 'uppercase',
              }}>{s.k}</div>
              <span className="mono num" style={{
                fontSize: 13, fontWeight: 700, textAlign: 'left',
                color: bWin ? 'var(--rm-chalk)' : 'var(--rm-text-muted)',
              }}>{s.b}{s.unit}</span>
            </div>
            <div style={{
              display: 'flex', height: 3, borderRadius: 2, overflow: 'hidden',
              gap: 2,
            }}>
              <div style={{
                width: `${aPct}%`, height: '100%',
                background: `linear-gradient(90deg, color-mix(in oklch, var(--rm-team-a) 60%, transparent), var(--rm-team-a))`,
                opacity: aWin ? 1 : 0.5,
                marginLeft: 'auto',
              }} />
              <div style={{
                width: `${bPct}%`, height: '100%',
                background: `linear-gradient(90deg, var(--rm-team-b), color-mix(in oklch, var(--rm-team-b) 60%, transparent))`,
                opacity: bWin ? 1 : 0.5,
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const PLAYER_RATINGS = [
  { n: 1,  name: 'Cole',     r: 6.4 },
  { n: 2,  name: 'Harker',   r: 7.2 },
  { n: 3,  name: 'Stanton',  r: 5.8 },
  { n: 4,  name: 'Elliot',   r: 6.6 },
  { n: 5,  name: 'Thornton', r: 4.9, card: 'Y' },
  { n: 6,  name: 'Price',    r: 7.4 },
  { n: 7,  name: 'Walsh',    r: 8.1, captain: true },
  { n: 8,  name: 'Reeves',   r: 7.8 },
  { n: 9,  name: 'Murray',   r: 6.9 },
  { n: 10, name: 'Daly',     r: 7.6 },
  { n: 11, name: 'Barnett',  r: 8.4, try: 1 },
  { n: 12, name: 'Foster',   r: 6.8, off: true },
  { n: 13, name: 'Spencer',  r: 6.5, on: true },
];

function PlayerRatings() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {PLAYER_RATINGS.map(p => {
        const c = p.r >= 8 ? 'var(--rm-stat-5)'
                : p.r >= 7 ? 'var(--rm-stat-4)'
                : p.r >= 6 ? 'var(--rm-stat-3)'
                : p.r >= 5 ? 'var(--rm-stat-2)'
                : 'var(--rm-stat-1)';
        return (
          <div key={p.n} style={{
            display: 'grid', gridTemplateColumns: '20px 1fr auto 26px',
            gap: 8, alignItems: 'center', padding: '7px 8px',
            borderBottom: '1px solid var(--rm-hairline)',
          }}>
            <span className="mono num" style={{ fontSize: 10, color: 'var(--rm-team-a)', fontWeight: 700, textAlign: 'center' }}>{p.n}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--rm-chalk)' }}>{p.name}</span>
              {p.captain && <Badge color="var(--rm-amber)">C</Badge>}
              {p.try    && <Badge color="var(--rm-pitch)">T</Badge>}
              {p.card   && <Badge color="var(--rm-stat-1)">{p.card}</Badge>}
              {p.off    && <Badge color="var(--rm-text-dim)">↓</Badge>}
              {p.on     && <Badge color="var(--rm-pitch)">↑</Badge>}
            </div>
            <StatBar value={p.r * 10} h={3} color={c} />
            <span className="mono num" style={{ fontSize: 12, fontWeight: 700, color: c, textAlign: 'right' }}>
              {p.r.toFixed(1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Badge({ children, color }) {
  return (
    <span className="mono" style={{
      fontSize: 8, fontWeight: 700, letterSpacing: '0.05em',
      width: 14, height: 14, borderRadius: 3,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: `color-mix(in oklch, ${color} 22%, transparent)`,
      color, border: `1px solid color-mix(in oklch, ${color} 50%, transparent)`,
    }}>{children}</span>
  );
}

Object.assign(window, { Commentary, MatchStats, PlayerRatings });
