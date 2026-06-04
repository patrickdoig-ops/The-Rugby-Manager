// Shared swipe-to-dismiss interaction. Attaches touch handlers to every
// element matching `itemSelector` inside `container`. `getContent` returns
// the child element that translates on drag (the visible card surface).
// `onDismiss` fires after the slide-out animation completes.
//
// Threshold: 38% of the item's rendered width.
// Timing:    220 ms ease slide-out / snap-back.
// Direction: left-only (translateX ≤ 0).
export function swipeToDismiss(
  container: HTMLElement,
  itemSelector: string,
  getContent: (item: HTMLElement) => HTMLElement | null,
  onDismiss: (item: HTMLElement) => void,
): void {
  container.querySelectorAll<HTMLElement>(itemSelector).forEach(item => {
    const content = getContent(item);
    if (!content) return;

    let startX = 0, startY = 0, active = false, isH = false;

    item.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      active = true; isH = false;
      content.style.transition = 'none';
    }, { passive: true });

    item.addEventListener('touchmove', e => {
      if (!active) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!isH) {
        if (Math.abs(dy) > Math.abs(dx) + 3) {
          active = false;
          content.style.transition = '';
          return;
        }
        if (Math.abs(dx) < 6) return;
        isH = true;
      }
      content.style.transform = `translateX(${Math.min(0, dx)}px)`;
    }, { passive: true });

    const onEnd = () => {
      if (!active || !isH) { active = false; return; }
      active = false;
      const tx = parseFloat(content.style.transform.match(/-?\d+(?:\.\d+)?/)?.[0] ?? '0');
      content.style.transition = 'transform 0.22s ease';
      if (tx < -(item.offsetWidth * 0.38)) {
        content.style.transform = `translateX(-${item.offsetWidth + 4}px)`;
        setTimeout(() => onDismiss(item), 220);
      } else {
        content.style.transform = 'translateX(0)';
      }
    };
    item.addEventListener('touchend', onEnd);
    item.addEventListener('touchcancel', onEnd);
  });
}
