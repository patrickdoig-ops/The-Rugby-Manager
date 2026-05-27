// Lightweight Canvas confetti for win celebrations. Mounts as a
// full-viewport overlay, autoplays on mount, removes itself when
// all particles fall offscreen.
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  vRotation: number;
  color: string;
  size: number;
  shape: 'square' | 'rect';
}

export function launchConfetti(
  teamColor: string,
  intensity: 'light' | 'normal' | 'storm' = 'normal',
): void {
  const count = intensity === 'light' ? 24 : intensity === 'storm' ? 80 : 48;

  let canvas = document.getElementById('confetti-canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'confetti-canvas';
    canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:200';
    document.body.appendChild(canvas);
  }
  const ctx = canvas.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;

  function resize() {
    canvas!.width = window.innerWidth * dpr;
    canvas!.height = window.innerHeight * dpr;
    canvas!.style.width = window.innerWidth + 'px';
    canvas!.style.height = window.innerHeight + 'px';
    ctx.scale(dpr, dpr);
  }
  resize();

  const root = getComputedStyle(document.documentElement);
  const palette = [
    teamColor,
    root.getPropertyValue('--rm-chalk').trim(),
    teamColor,
    teamColor,
    root.getPropertyValue('--rm-pitch').trim(),
  ];

  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * window.innerWidth,
      y: -10 - Math.random() * 100,
      vx: (Math.random() - 0.5) * 2,
      vy: 1.5 + Math.random() * 3.5,
      rotation: Math.random() * Math.PI * 2,
      vRotation: (Math.random() - 0.5) * 0.2,
      color: palette[Math.floor(Math.random() * palette.length)],
      size: 4 + Math.random() * 6,
      shape: Math.random() > 0.5 ? 'square' : 'rect',
    });
  }

  const gravity = 0.08;
  const drag = 0.998;

  function frame() {
    ctx.clearRect(0, 0, canvas!.width, canvas!.height);
    let alive = false;
    for (const p of particles) {
      p.vy += gravity;
      p.vx *= drag;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.vRotation;
      if (p.y < window.innerHeight + 20) alive = true;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      if (p.shape === 'square') {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    }
    if (alive) {
      requestAnimationFrame(frame);
    } else {
      canvas!.remove();
    }
  }
  requestAnimationFrame(frame);
}
