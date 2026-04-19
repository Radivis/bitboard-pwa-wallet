/**
 * Client-side hints for which PWA install copy to show first.
 * User-Agent is not cryptographically reliable; always offer a manual platform picker.
 */

export type InstallGuidePlatform =
  | 'ios'
  | 'android'
  | 'desktop-chromium'
  | 'desktop-safari'
  | 'desktop-firefox'
  | 'other';

function isLikelyIOS(): boolean {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  // iPadOS 13+ may report as Mac with touch
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  return false;
}

function isLikelyAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

/**
 * Returns a coarse platform bucket for install instructions (sync, runs in the browser only).
 */
export function detectInstallGuidePlatform(): InstallGuidePlatform {
  if (typeof window === 'undefined') return 'other';

  if (isLikelyIOS()) return 'ios';
  if (isLikelyAndroid()) return 'android';

  const ua = navigator.userAgent;
  const isMobile = /Mobi|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  if (isMobile) return 'other';

  if (/Firefox\//i.test(ua) && !/Seamonkey/i.test(ua)) return 'desktop-firefox';
  if (/Edg\//i.test(ua)) return 'desktop-chromium';
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return 'desktop-chromium';
  if (/Safari/i.test(ua) && !/Chrome|Chromium|Edg/i.test(ua)) return 'desktop-safari';

  return 'other';
}

export const INSTALL_PLATFORM_OPTIONS: { value: InstallGuidePlatform; label: string }[] = [
  { value: 'ios', label: 'iPhone / iPad (Safari)' },
  { value: 'android', label: 'Android (Chrome or similar)' },
  { value: 'desktop-chromium', label: 'Computer — Chrome, Edge, or Brave' },
  { value: 'desktop-safari', label: 'Computer — Safari (macOS)' },
  { value: 'desktop-firefox', label: 'Computer — Firefox' },
  { value: 'other', label: 'Other / not sure' },
];
