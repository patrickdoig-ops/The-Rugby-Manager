// The standard "?" help button. Screens embed helpButtonHtml(topic) in their
// header markup (standard screens drop it into the right-hand
// .app-topbar-spacer; custom-header screens use the floating variant). Clicks
// are handled by a single delegated listener (initHelpDelegation, wired once at
// startup), so no per-screen event wiring is needed and the button survives
// in-place re-renders for free.

import { openHelp } from './HelpOverlay';
import type { HelpTopicId } from './helpContent';

const HELP_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M12 17.25h.008v.008H12v-.008z"/><circle cx="12" cy="12" r="9.25"/></svg>`;

// Markup for a help button targeting `topic`. Pass floating=true on
// custom-header screens (Home, Team Selector, Mode Picker, Team Info) to pin it
// top-right instead of sitting in a header slot.
export function helpButtonHtml(topic: HelpTopicId, floating = false): string {
  const cls = `rm-help-btn${floating ? ' rm-help-btn--floating' : ''}`;
  return `<button type="button" class="${cls}" data-help="${topic}" aria-label="Help for this screen">${HELP_ICON}</button>`;
}

// One delegated click listener covering every help button in the app. Call once
// at startup.
let delegationInited = false;
export function initHelpDelegation(): void {
  if (delegationInited) return;
  delegationInited = true;
  document.addEventListener('click', e => {
    const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>('.rm-help-btn[data-help]');
    if (btn) openHelp(btn.dataset.help as HelpTopicId);
  });
}
