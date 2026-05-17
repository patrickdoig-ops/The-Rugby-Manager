// Rugby Manager — Splash / Title Screen

function SplashScreen() {
  return (
    <div className="rm rm-pitch-bg" style={{
      width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
      color: 'var(--rm-text)',
      display: 'flex', flexDirection: 'column',
      paddingTop: 56, // below status bar / island
    }}>
      {/* — Atmospheric pitch background overlay — */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0,
        background: `
          radial-gradient(ellipse 80% 55% at 50% 35%, color-mix(in oklch, var(--rm-pitch) 14%, transparent) 0%, transparent 65%),
          radial-gradient(ellipse 110% 60% at 50% 110%, color-mix(in oklch, var(--rm-bg-deep) 90%, black) 0%, transparent 60%)
        `,
        pointerEvents: 'none',
      }} />
      {/* — Faint pitch lines decoration — */}
      <svg aria-hidden width="100%" height="100%" viewBox="0 0 402 874" preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, opacity: 0.18, pointerEvents: 'none' }}>
        <defs>
          <linearGradient id="lineFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="50%" stopColor="white" stopOpacity="0.6" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" y1="220" x2="402" y2="220" stroke="url(#lineFade)" strokeWidth="0.6" />
        <line x1="0" y1="654" x2="402" y2="654" stroke="url(#lineFade)" strokeWidth="0.6" />
        <line x1="50%" y1="0" x2="50%" y2="874" stroke="url(#lineFade)" strokeWidth="0.6" />
        <circle cx="201" cy="437" r="80" stroke="url(#lineFade)" strokeWidth="0.6" fill="none" />
      </svg>

      {/* — Top chrome — */}
      <div style={{
        position: 'relative', zIndex: 2,
        padding: '0 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: 999,
            background: 'var(--rm-pitch)',
            boxShadow: '0 0 12px var(--rm-pitch)',
          }} />
          <span className="mono" style={{ fontSize: 10, letterSpacing: '0.22em', color: 'var(--rm-text-muted)', textTransform: 'uppercase' }}>
            Season 2026 · Connected
          </span>
        </div>
        <button style={{
          appearance: 'none', border: '1px solid var(--rm-border)',
          background: 'color-mix(in oklch, var(--rm-surface) 60%, transparent)',
          width: 36, height: 36, borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--rm-text-muted)', cursor: 'pointer',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </button>
      </div>

      {/* — Hero title block — */}
      <div style={{ flex: 1, position: 'relative', zIndex: 2,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '0 24px',
      }}>
        <Eyebrow style={{ marginBottom: 16, color: 'var(--rm-pitch)' }}>
          ▸  A SIMULATED RUGBY SEASON
        </Eyebrow>

        <h1 className="disp" style={{
          margin: 0, color: 'var(--rm-chalk)',
          fontSize: 96, lineHeight: 0.86, textTransform: 'uppercase',
          letterSpacing: '-0.005em',
        }}>
          Rugby<br />
          Manager
        </h1>

        <div style={{
          marginTop: 14, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '5px 11px', borderRadius: 999,
            background: 'color-mix(in oklch, var(--rm-pitch) 14%, transparent)',
            border: '1px solid color-mix(in oklch, var(--rm-pitch) 35%, transparent)',
          }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--rm-pitch)', letterSpacing: '0.1em' }}>v0.50α</span>
          </div>
          <div style={{ height: 1, flex: 1, background: 'var(--rm-hairline)' }} />
          <span className="mono" style={{ fontSize: 10, letterSpacing: '0.18em', color: 'var(--rm-text-dim)', textTransform: 'uppercase' }}>
            Round 14 · Final
          </span>
        </div>

        <p className="ed" style={{
          marginTop: 26, marginBottom: 0, fontSize: 22, lineHeight: 1.25,
          color: 'var(--rm-text-muted)', maxWidth: 320,
        }}>
          <span style={{ color: 'var(--rm-chalk)' }}>Final round of the season.</span>
          {' '}The Lions sit a point behind, the Eagles three above.
          Take them to the title.
        </p>
      </div>

      {/* — Match preview pill (next fixture teaser) — */}
      <div style={{
        position: 'relative', zIndex: 2,
        margin: '0 24px 16px',
        padding: '14px 16px',
        borderRadius: 16,
        background: 'color-mix(in oklch, var(--rm-surface) 80%, transparent)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        border: '1px solid var(--rm-hairline)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <Crest code="L" color="var(--rm-team-a)" size={42} />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <Eyebrow style={{ marginBottom: 2 }}>Next Fixture · Round 14</Eyebrow>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span className="mono" style={{ fontSize: 13, color: 'var(--rm-team-a)', fontWeight: 600 }}>LNS</span>
            <span className="ed" style={{ fontSize: 14, color: 'var(--rm-text-muted)' }}>vs</span>
            <span className="mono" style={{ fontSize: 13, color: 'var(--rm-team-b)', fontWeight: 600 }}>EGL</span>
          </div>
          <div className="mono" style={{ fontSize: 9, letterSpacing: '0.18em', color: 'var(--rm-text-dim)', marginTop: 2, textTransform: 'uppercase' }}>
            Sat 20:00 · Albion Park
          </div>
        </div>
        <Crest code="E" color="var(--rm-team-b)" size={42} />
      </div>

      {/* — CTA stack — */}
      <div style={{
        position: 'relative', zIndex: 2,
        padding: '0 24px 40px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <button style={{
          appearance: 'none', border: 'none', cursor: 'pointer',
          padding: '20px 22px',
          background: 'var(--rm-pitch)',
          color: 'var(--rm-bg-deep)',
          borderRadius: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 12px 36px color-mix(in oklch, var(--rm-pitch) 28%, transparent), inset 0 1px 0 rgba(255,255,255,0.3)',
        }}>
          <span className="disp" style={{ fontSize: 28, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Start Game</span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </button>

        <div style={{ display: 'flex', gap: 10 }}>
          <button style={{
            flex: 1, appearance: 'none', cursor: 'pointer',
            padding: '14px 14px', borderRadius: 14,
            background: 'var(--rm-surface)',
            border: '1px solid var(--rm-border-soft)',
            color: 'var(--rm-chalk)',
            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
          }}>
            <span className="mono" style={{ fontSize: 9, letterSpacing: '0.18em', color: 'var(--rm-text-dim)' }}>RESUME</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Career → R14</span>
          </button>
          <button style={{
            flex: 1, appearance: 'none', cursor: 'pointer',
            padding: '14px 14px', borderRadius: 14,
            background: 'transparent',
            border: '1px solid var(--rm-border-soft)',
            color: 'var(--rm-text-muted)',
            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
          }}>
            <span className="mono" style={{ fontSize: 9, letterSpacing: '0.18em', color: 'var(--rm-text-dim)' }}>SETUP</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>New Career</span>
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SplashScreen });
