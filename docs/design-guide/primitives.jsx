// Shared UI primitives for Rugby Manager screens

const TEAMS = {
  LNS: {
    code: 'LNS',
    name: 'The Lions',
    full: 'Northcote Lions',
    color: 'var(--rm-team-a)',
    soft: 'var(--rm-team-a-soft)',
    crest: '🦁', // we will not render emoji, this is just for reference
  },
  EGL: {
    code: 'EGL',
    name: 'The Eagles',
    full: 'Eastgate Eagles',
    color: 'var(--rm-team-b)',
    soft: 'var(--rm-team-b-soft)',
  },
};

// — Monogram crest tile — used everywhere a logo would go
function Crest({ code, color, size = 44, dim = false }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 8,
      background: dim
        ? `color-mix(in oklch, ${color} 18%, var(--rm-surface))`
        : `linear-gradient(160deg, ${color} 0%, color-mix(in oklch, ${color} 65%, black) 100%)`,
      border: `1px solid color-mix(in oklch, ${color} 50%, transparent)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--rm-font-display)',
      fontSize: size * 0.5, lineHeight: 1, color: 'var(--rm-chalk)',
      letterSpacing: '-0.02em',
      boxShadow: dim ? 'none' : `0 6px 16px color-mix(in oklch, ${color} 30%, transparent), inset 0 1px 0 rgba(255,255,255,0.15)`,
      position: 'relative', overflow: 'hidden', flexShrink: 0,
    }}>
      <div style={{ position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.18) 100%)' }} />
      <span style={{ position: 'relative', zIndex: 1 }}>{code.slice(0, 1)}</span>
    </div>
  );
}

// — Stat color scale for 0-99 stat values
function statColor(v) {
  if (v >= 88) return 'var(--rm-stat-5)';
  if (v >= 78) return 'var(--rm-stat-4)';
  if (v >= 65) return 'var(--rm-stat-3)';
  if (v >= 50) return 'var(--rm-stat-2)';
  return 'var(--rm-stat-1)';
}

// — Form pin: W / L / D
function FormPin({ r }) {
  const map = {
    W: { bg: 'var(--rm-pitch)',  fg: 'var(--rm-bg-deep)' },
    L: { bg: 'color-mix(in oklch, var(--rm-stat-1) 25%, var(--rm-surface-2))', fg: 'var(--rm-stat-1)' },
    D: { bg: 'var(--rm-surface-3)', fg: 'var(--rm-text-muted)' },
  };
  const m = map[r] || map.D;
  return (
    <span className="mono" style={{
      width: 18, height: 18, borderRadius: 4,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: m.bg, color: m.fg, fontSize: 10, fontWeight: 700,
    }}>{r}</span>
  );
}

// — Tiny "rugby ball" mark
function BallMark({ size = 18, color = 'var(--rm-amber)' }) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 30 18" style={{ display: 'block' }}>
      <ellipse cx="15" cy="9" rx="14" ry="7.5" fill={color} stroke="color-mix(in oklch, var(--rm-amber-deep) 80%, black)" strokeWidth="0.8" />
      <path d="M3 9 L27 9" stroke="rgba(255,255,255,0.55)" strokeWidth="0.8" strokeLinecap="round" />
      <g stroke="rgba(255,255,255,0.55)" strokeWidth="0.8" strokeLinecap="round">
        <path d="M10 7.5 L10 10.5" />
        <path d="M14 7 L14 11" />
        <path d="M18 7 L18 11" />
        <path d="M22 7.5 L22 10.5" />
      </g>
    </svg>
  );
}

// — Section eyebrow (small uppercase mono label)
function Eyebrow({ children, color = 'var(--rm-text-muted)', style = {} }) {
  return (
    <div className="mono" style={{
      fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
      color, fontWeight: 500, ...style,
    }}>{children}</div>
  );
}

// — Section divider with optional label
function Rule({ label, accent = 'var(--rm-divider)' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 1, background: accent, opacity: 0.7 }} />
      {label && <Eyebrow color="var(--rm-text-dim)">{label}</Eyebrow>}
      <div style={{ flex: 1, height: 1, background: accent, opacity: 0.7 }} />
    </div>
  );
}

// — Stat bar (horizontal)
function StatBar({ value, max = 99, color, h = 4 }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const c = color || statColor(value);
  return (
    <div style={{
      flex: 1, height: h, borderRadius: h,
      background: 'color-mix(in oklch, var(--rm-surface-3) 80%, transparent)',
      overflow: 'hidden', position: 'relative',
    }}>
      <div style={{
        width: `${pct}%`, height: '100%',
        background: `linear-gradient(90deg, color-mix(in oklch, ${c} 60%, transparent) 0%, ${c} 100%)`,
        boxShadow: `0 0 10px color-mix(in oklch, ${c} 50%, transparent)`,
      }} />
    </div>
  );
}

Object.assign(window, { TEAMS, Crest, statColor, FormPin, BallMark, Eyebrow, Rule, StatBar });
