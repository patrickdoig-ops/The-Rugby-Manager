// Rugby Manager — Design System Style Guide

function SwatchTile({ name, token, hint, fg = 'var(--rm-chalk)', tall = 96 }) {
  return (
    <div style={{
      borderRadius: 10, padding: 12, height: tall,
      background: `var(${token})`,
      color: fg,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      border: '1px solid var(--rm-hairline)',
    }}>
      <div className="mono" style={{ fontSize: 10, letterSpacing: '0.1em', opacity: 0.78 }}>{name}</div>
      <div className="mono" style={{ fontSize: 10, opacity: 0.6 }}>{hint}</div>
    </div>
  );
}

function StyleGuide() {
  const positions = [
    { p: 1, name: 'Cole',     pos: 'Loosehead Prop',  ovr: 68 },
    { p: 2, name: 'Harker',   pos: 'Hooker',          ovr: 74 },
    { p: 9, name: 'Murray',   pos: 'Scrum-Half',      ovr: 79 },
    { p: 10, name: 'Daly',    pos: 'Fly-Half',        ovr: 77 },
  ];

  return (
    <div className="rm" style={{
      width: '100%', minHeight: '100%',
      background: 'var(--rm-bg)',
      padding: 36,
      color: 'var(--rm-text)',
    }}>
      {/* — Header — */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28, gap: 24 }}>
        <div>
          <Eyebrow style={{ marginBottom: 8 }}>Rugby Manager · Design Guide</Eyebrow>
          <h1 className="disp" style={{
            margin: 0, fontSize: 84, lineHeight: 0.88, color: 'var(--rm-chalk)',
            textTransform: 'uppercase', letterSpacing: '-0.01em',
          }}>
            Match Day
            <span className="ed" style={{
              display: 'inline-block', marginLeft: 14, fontStyle: 'italic',
              fontSize: 64, color: 'var(--rm-pitch)', letterSpacing: 0,
              fontFamily: 'var(--rm-font-editor)', fontWeight: 400, textTransform: 'none',
              verticalAlign: 'baseline',
            }}>editorial</span>
          </h1>
          <p style={{
            maxWidth: 560, color: 'var(--rm-text-muted)', lineHeight: 1.45,
            fontSize: 14, marginTop: 14,
          }}>
            A dark, atmospheric system built for live data density. Heavy condensed display
            type for moments of impact, sober body type for legibility, mono for stats and
            tactical labels. Selective use of <span style={{ color: 'var(--rm-pitch)' }}>pitch green</span> as
            the live-action signal — every other element earns its color.
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--rm-text-dim)' }}>VERSION</div>
          <div className="disp" style={{ fontSize: 36, color: 'var(--rm-chalk)', lineHeight: 1 }}>0.50<span style={{ color: 'var(--rm-pitch)' }}>α</span></div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--rm-text-dim)', marginTop: 4 }}>MAY 17 · 2026</div>
        </div>
      </div>

      {/* — Color — */}
      <Section title="01 / Color" subtitle="Surfaces, accents, and the stat heatmap.">
        <Grid cols={6}>
          <SwatchTile name="BG"          token="--rm-bg"          hint="0.16 · 150" />
          <SwatchTile name="BG DEEP"     token="--rm-bg-deep"     hint="0.12 · 150" />
          <SwatchTile name="SURFACE"     token="--rm-surface"     hint="0.21 · 150" />
          <SwatchTile name="SURFACE 2"   token="--rm-surface-2"   hint="0.25 · 150" />
          <SwatchTile name="SURFACE 3"   token="--rm-surface-3"   hint="0.30 · 150" />
          <SwatchTile name="BORDER"      token="--rm-border"      hint="0.32 · 150" />
        </Grid>
        <div style={{ height: 12 }} />
        <Grid cols={6}>
          <SwatchTile name="PITCH"       token="--rm-pitch"       hint="0.76 · 144" fg="var(--rm-bg-deep)" />
          <SwatchTile name="PITCH DEEP"  token="--rm-pitch-deep"  hint="0.55 · 144" />
          <SwatchTile name="CHALK"       token="--rm-chalk"       hint="0.97 · 90"  fg="var(--rm-bg-deep)" />
          <SwatchTile name="AMBER"       token="--rm-amber"       hint="ball · 62"  fg="var(--rm-bg-deep)" />
          <SwatchTile name="TEAM A"      token="--rm-team-a"      hint="opp · red"  fg="var(--rm-chalk)" />
          <SwatchTile name="TEAM B"      token="--rm-team-b"      hint="opp · blue" fg="var(--rm-chalk)" />
        </Grid>
        <div style={{ height: 16 }} />
        <Eyebrow style={{ marginBottom: 8 }}>Stat heatmap · 0 → 99</Eyebrow>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            ['0–49',  'var(--rm-stat-1)', 'poor'],
            ['50–64', 'var(--rm-stat-2)', 'below'],
            ['65–77', 'var(--rm-stat-3)', 'average'],
            ['78–87', 'var(--rm-stat-4)', 'good'],
            ['88–99', 'var(--rm-stat-5)', 'elite'],
          ].map(([range, c, l]) => (
            <div key={range} style={{
              flex: 1, padding: '10px 12px', borderRadius: 8,
              background: 'color-mix(in oklch, ' + c + ' 14%, var(--rm-surface))',
              borderLeft: `3px solid ${c}`,
            }}>
              <div className="mono num" style={{ fontSize: 16, color: c, fontWeight: 600 }}>{range}</div>
              <div className="mono" style={{ fontSize: 10, letterSpacing: '0.15em', color: 'var(--rm-text-muted)', textTransform: 'uppercase', marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* — Type — */}
      <Section title="02 / Type" subtitle="Four families, used with discipline.">
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 24, alignItems: 'baseline' }}>
          <Eyebrow>Display · Anton</Eyebrow>
          <div className="disp" style={{ fontSize: 64, lineHeight: 0.95, color: 'var(--rm-chalk)', textTransform: 'uppercase' }}>72′ The Eagles win it</div>

          <Eyebrow>Editorial · Instrument Serif</Eyebrow>
          <div className="ed" style={{ fontSize: 38, lineHeight: 1.05, color: 'var(--rm-pitch)' }}>second half, all to play for…</div>

          <Eyebrow>Body · Geist</Eyebrow>
          <div style={{ fontSize: 17, lineHeight: 1.5, color: 'var(--rm-text)', maxWidth: 520 }}>
            A grinding scrum on the 22, the Lions piling forward with the kind of intent
            that only comes from being three points down with the clock red.
          </div>

          <Eyebrow>Mono · JetBrains</Eyebrow>
          <div className="mono num" style={{ fontSize: 16, color: 'var(--rm-text)' }}>
            <span style={{ color: 'var(--rm-text-dim)' }}>OVR </span>78
            <span style={{ color: 'var(--rm-text-dim)' }}>  STM </span>87
            <span style={{ color: 'var(--rm-text-dim)' }}>  STR </span>88
            <span style={{ color: 'var(--rm-text-dim)' }}>  TKL </span><span style={{ color: 'var(--rm-stat-4)' }}>84</span>
          </div>

          <Eyebrow>Scale</Eyebrow>
          <div className="mono" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--rm-text-muted)' }}>
            <span><span style={{ color: 'var(--rm-chalk)' }}>10</span> · micro</span>
            <span><span style={{ color: 'var(--rm-chalk)' }}>12</span> · label</span>
            <span><span style={{ color: 'var(--rm-chalk)' }}>14</span> · body</span>
            <span><span style={{ color: 'var(--rm-chalk)' }}>17</span> · lead</span>
            <span><span style={{ color: 'var(--rm-chalk)' }}>24</span> · title</span>
            <span><span style={{ color: 'var(--rm-chalk)' }}>36</span> · big</span>
            <span><span style={{ color: 'var(--rm-chalk)' }}>64+</span> · hero</span>
          </div>
        </div>
      </Section>

      {/* — Components — */}
      <Section title="03 / Components" subtitle="Atoms that compose every screen.">
        <Grid cols={2} gap={16}>
          {/* Buttons */}
          <Card title="BUTTONS">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <PrimaryBtn>▶  Kick Off</PrimaryBtn>
              <SecondaryBtn>Continue Career</SecondaryBtn>
              <GhostBtn>Tactics</GhostBtn>
            </div>
          </Card>

          {/* Crests */}
          <Card title="CRESTS / MONOGRAMS">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Crest code="L" color="var(--rm-team-a)" size={56} />
              <Crest code="E" color="var(--rm-team-b)" size={56} />
              <Crest code="N" color="var(--rm-pitch)" size={56} />
              <Crest code="A" color="var(--rm-team-a)" size={40} dim />
            </div>
          </Card>

          {/* Stat bars */}
          <Card title="STAT BAR · PLAYER">
            {positions.map(pl => (
              <div key={pl.p} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--rm-hairline)' }}>
                <span className="mono num" style={{ fontSize: 11, color: 'var(--rm-text-dim)', width: 18 }}>{String(pl.p).padStart(2, '0')}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.1 }}>{pl.name}</div>
                  <div className="mono" style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--rm-text-dim)', textTransform: 'uppercase' }}>{pl.pos}</div>
                </div>
                <StatBar value={pl.ovr} />
                <span className="mono num" style={{ fontSize: 13, color: statColor(pl.ovr), fontWeight: 600, width: 22, textAlign: 'right' }}>{pl.ovr}</span>
              </div>
            ))}
          </Card>

          {/* Form pins / chips */}
          <Card title="FORM PINS · CHIPS">
            <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
              {'WWLWD'.split('').map((r, i) => <FormPin key={i} r={r} />)}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Chip>Live</Chip>
              <Chip color="var(--rm-pitch)">Half-time</Chip>
              <Chip color="var(--rm-amber)">Penalty</Chip>
              <Chip color="var(--rm-stat-1)">Yellow</Chip>
            </div>
          </Card>

          {/* Score block */}
          <Card title="SCORE BLOCK" full>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 16 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Crest code="L" color="var(--rm-team-a)" size={36} />
                <div>
                  <div className="mono" style={{ fontSize: 10, letterSpacing: '0.16em', color: 'var(--rm-team-a)' }}>LNS</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>The Lions</div>
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div className="disp num" style={{ fontSize: 44, lineHeight: 0.9, color: 'var(--rm-chalk)' }}>
                  14 <span style={{ color: 'var(--rm-text-faint)' }}>–</span> 17
                </div>
                <div className="mono" style={{ fontSize: 10, letterSpacing: '0.2em', color: 'var(--rm-pitch)', marginTop: 4 }}>
                  · 72′ LIVE ·
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
                <div style={{ textAlign: 'right' }}>
                  <div className="mono" style={{ fontSize: 10, letterSpacing: '0.16em', color: 'var(--rm-team-b)' }}>EGL</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>The Eagles</div>
                </div>
                <Crest code="E" color="var(--rm-team-b)" size={36} />
              </div>
            </div>
          </Card>

          {/* Pitch territory */}
          <Card title="PITCH TERRITORY" full>
            <PitchStrip ballX={0.62} attacking="EGL" />
          </Card>
        </Grid>
      </Section>

      <Section title="04 / Voice" subtitle="Editorial, lean, present-tense.">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ padding: 16, borderRadius: 10, background: 'var(--rm-surface)', border: '1px solid var(--rm-hairline)' }}>
            <Eyebrow color="var(--rm-pitch)">Do</Eyebrow>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: 'var(--rm-text)' }}>
              <li>“Eagles win the toss, kick to the left.”</li>
              <li>“Murray feeds; Daly with the chip…”</li>
              <li>Use minutes (’) and tabular numbers.</li>
              <li>Lowercase commentary, uppercase scores.</li>
            </ul>
          </div>
          <div style={{ padding: 16, borderRadius: 10, background: 'var(--rm-surface)', border: '1px solid var(--rm-hairline)' }}>
            <Eyebrow color="var(--rm-stat-1)">Don't</Eyebrow>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: 'var(--rm-text-muted)' }}>
              <li>“The Eagles team has won the coin toss…”</li>
              <li>Exclamation marks for routine play.</li>
              <li>Decorative emoji or stadium clichés.</li>
              <li>Color-coding more than two teams at once.</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* footer */}
      <div style={{ marginTop: 32, paddingTop: 18, borderTop: '1px solid var(--rm-hairline)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Eyebrow>Rugby Manager · Match Day Editorial · v0.50α</Eyebrow>
        <Eyebrow color="var(--rm-text-dim)">drag artboards · click to focus</Eyebrow>
      </div>
    </div>
  );
}

// — helpers —
function Section({ title, subtitle, children }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 16 }}>
        <h2 className="disp" style={{
          margin: 0, fontSize: 28, color: 'var(--rm-chalk)',
          textTransform: 'uppercase', letterSpacing: '0.02em',
        }}>{title}</h2>
        <div style={{ flex: 1, height: 1, background: 'var(--rm-hairline)' }} />
        <div style={{ fontSize: 13, color: 'var(--rm-text-muted)' }}>{subtitle}</div>
      </div>
      {children}
    </section>
  );
}

function Grid({ cols = 4, gap = 10, children }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap,
    }}>{children}</div>
  );
}

function Card({ title, children, full }) {
  return (
    <div style={{
      gridColumn: full ? '1 / -1' : undefined,
      borderRadius: 14, padding: 18,
      background: 'var(--rm-surface)',
      border: '1px solid var(--rm-hairline)',
    }}>
      <Eyebrow style={{ marginBottom: 14 }}>{title}</Eyebrow>
      {children}
    </div>
  );
}

function PrimaryBtn({ children }) {
  return (
    <button style={{
      appearance: 'none', border: 'none', cursor: 'pointer',
      padding: '14px 18px',
      background: 'var(--rm-pitch)', color: 'var(--rm-bg-deep)',
      fontFamily: 'var(--rm-font-display)', fontSize: 22, letterSpacing: '0.08em',
      textTransform: 'uppercase', borderRadius: 12, textAlign: 'left',
      boxShadow: '0 8px 24px color-mix(in oklch, var(--rm-pitch) 30%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)',
    }}>{children}</button>
  );
}
function SecondaryBtn({ children }) {
  return (
    <button style={{
      appearance: 'none', border: '1px solid var(--rm-border)', cursor: 'pointer',
      padding: '13px 18px',
      background: 'var(--rm-surface-2)', color: 'var(--rm-chalk)',
      fontFamily: 'var(--rm-font-body)', fontSize: 14, fontWeight: 600,
      borderRadius: 12, textAlign: 'left',
    }}>{children}</button>
  );
}
function GhostBtn({ children }) {
  return (
    <button style={{
      appearance: 'none', border: '1px dashed var(--rm-border)', cursor: 'pointer',
      padding: '12px 18px',
      background: 'transparent', color: 'var(--rm-text-muted)',
      fontFamily: 'var(--rm-font-mono)', fontSize: 12, letterSpacing: '0.15em',
      textTransform: 'uppercase', borderRadius: 12, textAlign: 'left',
    }}>{children}</button>
  );
}
function Chip({ children, color = 'var(--rm-text-muted)' }) {
  return (
    <span className="mono" style={{
      padding: '4px 10px', borderRadius: 999,
      fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
      background: `color-mix(in oklch, ${color} 14%, var(--rm-surface-2))`,
      color, border: `1px solid color-mix(in oklch, ${color} 30%, transparent)`,
    }}>{children}</span>
  );
}

// — Pitch strip (used in style guide + live match) —
function PitchStrip({ ballX = 0.5, attacking = 'EGL', h = 56, showLabels = true }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {showLabels && <span className="mono" style={{ fontSize: 11, color: 'var(--rm-team-a)', fontWeight: 600 }}>LNS</span>}
      <div style={{
        flex: 1, height: h, borderRadius: 8, position: 'relative', overflow: 'hidden',
        background: `
          repeating-linear-gradient(90deg,
            color-mix(in oklch, var(--rm-pitch-deep) 60%, var(--rm-bg-deep)) 0,
            color-mix(in oklch, var(--rm-pitch-deep) 60%, var(--rm-bg-deep)) 14px,
            color-mix(in oklch, var(--rm-pitch-deep) 75%, var(--rm-bg-deep)) 14px,
            color-mix(in oklch, var(--rm-pitch-deep) 75%, var(--rm-bg-deep)) 28px)`,
        border: '1px solid color-mix(in oklch, var(--rm-pitch) 25%, transparent)',
      }}>
        {/* try lines (left/right) */}
        <div style={{ position: 'absolute', left: '8%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.5)' }} />
        <div style={{ position: 'absolute', right: '8%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.5)' }} />
        {/* halfway */}
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.8)' }} />
        {/* 22m lines */}
        <div style={{ position: 'absolute', left: '24%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.25)' }} />
        <div style={{ position: 'absolute', right: '24%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.25)' }} />
        {/* ball */}
        <div style={{
          position: 'absolute', top: '50%', left: `${ballX * 100}%`,
          transform: 'translate(-50%, -50%)',
          filter: 'drop-shadow(0 0 10px color-mix(in oklch, var(--rm-amber) 60%, transparent))',
        }}>
          <BallMark size={26} />
        </div>
        {/* attacking direction overlay */}
        <div className="mono" style={{
          position: 'absolute', bottom: 4, left: 0, right: 0, textAlign: 'center',
          fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.75)',
          textTransform: 'uppercase',
        }}>
          {attacking} attacking {attacking === 'EGL' ? '→' : '←'}
        </div>
      </div>
      {showLabels && <span className="mono" style={{ fontSize: 11, color: 'var(--rm-team-b)', fontWeight: 600 }}>EGL</span>}
    </div>
  );
}

Object.assign(window, { StyleGuide, PitchStrip, Chip, PrimaryBtn, SecondaryBtn, GhostBtn });
