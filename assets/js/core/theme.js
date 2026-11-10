/**
 * theme.js — paper (light) and ink (dark).
 * The choice is remembered; with no choice the site follows the device.
 * Where the browser supports it, the new theme opens like an iris from the button.
 */

const KEY = 'theme';

export class Theme {
  static get current() { return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; }

  static apply(mode) {
    document.documentElement.dataset.theme = mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#0f0d0b' : '#f3eee4');
    dispatchEvent(new CustomEvent('themechange', { detail: mode }));
  }

  static toggle(event) {
    const next = Theme.current === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
    const root = document.documentElement;
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return Theme.apply(next);
    const r = event?.currentTarget?.getBoundingClientRect();
    if (r) {
      root.style.setProperty('--tx', `${r.left + r.width / 2}px`);
      root.style.setProperty('--ty', `${r.top + r.height / 2}px`);
    }
    root.classList.add('theme-swap');
    document.startViewTransition(() => Theme.apply(next)).finished.finally(() => root.classList.remove('theme-swap'));
  }
}
