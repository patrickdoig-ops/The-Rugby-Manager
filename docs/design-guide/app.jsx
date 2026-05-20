// Rugby Manager — Design Canvas App

function App() {
  return (
    <DesignCanvas>
      <DCSection id="screens" title="01 · Screens" subtitle="Three redesigned views — splash, match preview, live match.">
        <DCArtboard id="splash" label="Splash · Title Screen" width={402} height={874}>
          <IOSDevice dark>
            <SplashScreen />
          </IOSDevice>
        </DCArtboard>
        <DCArtboard id="preview" label="Match Preview · Lions Roster" width={402} height={874}>
          <IOSDevice dark>
            <MatchPreview />
          </IOSDevice>
        </DCArtboard>
        <DCArtboard id="live" label="Live Match · 72′" width={402} height={874}>
          <IOSDevice dark>
            <MatchLive />
          </IOSDevice>
        </DCArtboard>
      </DCSection>

      <DCSection id="ds" title="02 · Design System" subtitle="Tokens, type, and components.">
        <DCArtboard id="guide" label="Match Day Editorial · v0.50α" width={920} height={1480}>
          <StyleGuide />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
