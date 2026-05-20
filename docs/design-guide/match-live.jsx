// Rugby Manager — Live Match Screen (container)

function MatchLive() {
  const [tab, setTab] = React.useState('commentary');
  const [playing, setPlaying] = React.useState(true);
  const [speed, setSpeed] = React.useState(1500);

  return (
    <div className="rm" style={{
      width: '100%', height: '100%',
      background: 'var(--rm-bg)',
      display: 'flex', flexDirection: 'column',
      paddingTop: 50,
      position: 'relative', overflow: 'hidden',
    }}>
      <style>{`
        @keyframes rmPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>

      <MatchScoreboard />

      {/* Tabs */}
      <div style={{
        display: 'flex', padding: '0 16px',
        gap: 4,
        borderBottom: '1px solid var(--rm-hairline)',
      }}>
        {[
          { id: 'commentary', label: 'Commentary' },
          { id: 'stats',      label: 'Match Stats' },
          { id: 'players',    label: 'Ratings'    },
        ].map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                appearance: 'none', border: 'none', background: 'transparent', cursor: 'pointer',
                padding: '12px 6px', marginRight: 12, position: 'relative',
                color: active ? 'var(--rm-chalk)' : 'var(--rm-text-dim)',
                fontFamily: 'var(--rm-font-body)',
                fontSize: 13, fontWeight: active ? 600 : 500,
              }}>
              {t.label}
              {active && <div style={{
                position: 'absolute', bottom: -1, left: 0, right: 0, height: 2,
                background: 'var(--rm-pitch)', borderRadius: 1,
                boxShadow: '0 0 10px var(--rm-pitch)',
              }} />}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px 110px' }}>
        {tab === 'commentary' && <Commentary />}
        {tab === 'stats'      && <MatchStats />}
        {tab === 'players'    && <PlayerRatings />}
      </div>

      {/* Playback controls */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '12px 16px 30px',
        background: `linear-gradient(180deg, transparent 0%,
          color-mix(in oklch, var(--rm-bg-deep) 92%, transparent) 30%,
          var(--rm-bg-deep) 100%)`,
        zIndex: 10,
      }}>
        <div style={{
          padding: '10px 12px',
          borderRadius: 14,
          background: 'color-mix(in oklch, var(--rm-surface) 85%, transparent)',
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          border: '1px solid var(--rm-hairline)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          {/* Play / pause / settings */}
          <button onClick={() => setPlaying(p => !p)} style={{
            appearance: 'none', border: 'none', cursor: 'pointer',
            width: 44, height: 44, borderRadius: 10,
            background: playing ? 'var(--rm-pitch)' : 'var(--rm-surface-3)',
            color: playing ? 'var(--rm-bg-deep)' : 'var(--rm-chalk)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: playing ? '0 0 16px color-mix(in oklch, var(--rm-pitch) 50%, transparent)' : 'none',
          }}>
            {playing
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8V4z" /></svg>}
          </button>
          <button style={{
            appearance: 'none', border: '1px solid var(--rm-border)', cursor: 'pointer',
            width: 36, height: 44, borderRadius: 10, background: 'transparent',
            color: 'var(--rm-text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4l16 8L4 20V4z" />
            </svg>
          </button>

          {/* Speed slider */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="mono" style={{ fontSize: 9, letterSpacing: '0.16em', color: 'var(--rm-text-dim)', textTransform: 'uppercase' }}>Sim Speed</span>
              <span className="mono num" style={{ fontSize: 10, color: 'var(--rm-pitch)' }}>{speed}<span style={{ opacity: 0.6 }}>ms</span></span>
            </div>
            <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'var(--rm-surface-2)' }}>
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: `${((3000 - speed) / 2900) * 100}%`, borderRadius: 3,
                background: 'linear-gradient(90deg, var(--rm-pitch-deep), var(--rm-pitch))',
              }} />
              <div style={{
                position: 'absolute', top: '50%', left: `${((3000 - speed) / 2900) * 100}%`,
                width: 12, height: 12, borderRadius: '50%',
                background: 'var(--rm-chalk)', transform: 'translate(-50%, -50%)',
                border: '2px solid var(--rm-pitch)',
              }} />
            </div>
          </div>

          <button style={{
            appearance: 'none', border: '1px solid var(--rm-border)', cursor: 'pointer',
            width: 36, height: 44, borderRadius: 10,
            background: 'transparent', color: 'var(--rm-text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { MatchLive });
