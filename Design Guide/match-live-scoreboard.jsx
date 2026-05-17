// Rugby Manager — Live Match: Top Scoreboard

function MatchScoreboard({ minute = 72, scoreA = 14, scoreB = 17, phase = 'LIVE' }) {
  return (
    <div style={{
      position: 'relative', padding: '8px 16px 14px',
      background: `linear-gradient(180deg,
        color-mix(in oklch, var(--rm-bg-deep) 95%, transparent) 0%,
        var(--rm-bg) 100%)`,
      borderBottom: '1px solid var(--rm-hairline)',
    }}>
      {/* meta row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <button style={{
          appearance: 'none', border: 'none', background: 'transparent', cursor: 'pointer',
          color: 'var(--rm-text-muted)', display: 'flex', alignItems: 'center', gap: 4, padding: 0,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 6, height: 6, borderRadius: 999,
            background: 'var(--rm-pitch)',
            boxShadow: '0 0 8px var(--rm-pitch)',
            animation: 'rmPulse 1.8s ease-in-out infinite',
          }} />
          <span className="mono" style={{ fontSize: 10, letterSpacing: '0.2em', color: 'var(--rm-pitch)', textTransform: 'uppercase' }}>
            {phase} · 2nd Half
          </span>
        </div>
        <span className="mono" style={{ fontSize: 10, letterSpacing: '0.16em', color: 'var(--rm-text-dim)' }}>R14</span>
      </div>

      {/* score block */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8 }}>
        {/* LNS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Crest code="L" color="var(--rm-team-a)" size={40} />
          <div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: '0.16em', color: 'var(--rm-team-a)', fontWeight: 700 }}>LNS</div>
            <div className="disp num" style={{ fontSize: 52, color: 'var(--rm-chalk)', lineHeight: 0.85, marginTop: 2 }}>
              {String(scoreA).padStart(2, '0')}
            </div>
          </div>
        </div>

        {/* clock */}
        <div style={{ textAlign: 'center', padding: '0 4px' }}>
          <div className="ed" style={{ fontSize: 26, color: 'var(--rm-pitch)', fontStyle: 'italic', lineHeight: 1 }}>
            {minute}′
          </div>
          <div className="mono" style={{ fontSize: 9, letterSpacing: '0.18em', color: 'var(--rm-text-dim)', marginTop: 4 }}>
            08′ LEFT
          </div>
        </div>

        {/* EGL */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
          <div style={{ textAlign: 'right' }}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: '0.16em', color: 'var(--rm-team-b)', fontWeight: 700 }}>EGL</div>
            <div className="disp num" style={{ fontSize: 52, color: 'var(--rm-chalk)', lineHeight: 0.85, marginTop: 2 }}>
              {String(scoreB).padStart(2, '0')}
            </div>
          </div>
          <Crest code="E" color="var(--rm-team-b)" size={40} />
        </div>
      </div>

      {/* pitch strip */}
      <div style={{ marginTop: 12 }}>
        <PitchStrip ballX={0.62} attacking="EGL" h={36} showLabels />
      </div>
    </div>
  );
}

Object.assign(window, { MatchScoreboard });
