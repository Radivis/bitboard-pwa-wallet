/**
 * Heuristic: whether a click inside an explainer zone (data-infomode-id) was on a primary,
 * app-like action surface. The platform cannot list listeners, so this uses DOM + ARIA
 * and optional [data-infomode-primary-surface] for div-onClick patterns.
 */
export const DATA_INFOMODE_PRIMARY_SURFACE = 'data-infomode-primary-surface'

const ARIA_ROLES_ACTION = new Set([
  'button',
  'link',
  'tab',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'switch',
  'checkbox',
  'radio',
  'option',
  'combobox',
  'searchbox',
  'textbox',
  'listbox',
  'slider',
  'spinbutton',
])

function isInertish(el: Element): boolean {
  if (el.getAttribute('aria-disabled') === 'true') {
    return true
  }
  if (el.closest('fieldset[disabled]') !== null) {
    return true
  }
  if ('disabled' in el && (el as HTMLInputElement & { disabled?: boolean }).disabled === true) {
    return true
  }
  return false
}

function hasActionRole(el: Element): boolean {
  const r = el.getAttribute('role')
  if (!r) {
    return false
  }
  return ARIA_ROLES_ACTION.has(r.trim().toLowerCase())
}

function isTabindexFocusableForAction(el: Element): boolean {
  if (!el.hasAttribute('tabindex')) {
    return false
  }
  const t = el.getAttribute('tabindex')?.trim() ?? ''
  if (t === '-1' || t === '') {
    return false
  }
  const n = Number.parseInt(t, 10)
  return n >= 0
}

function isNativeLink(el: Element): boolean {
  if (el.tagName !== 'A' && el.tagName !== 'a') {
    return false
  }
  return el.hasAttribute('href') && (el.getAttribute('href') ?? '') !== ''
}

function isMapAreaWithHref(el: Element): boolean {
  if (el.tagName !== 'AREA' && el.tagName !== 'area') {
    return false
  }
  return el.hasAttribute('href') && (el.getAttribute('href') ?? '') !== ''
}

function isFormControlLike(el: Element): boolean {
  if (el instanceof HTMLTextAreaElement) {
    return true
  }
  if (el instanceof HTMLSelectElement) {
    return true
  }
  if (el instanceof HTMLOptionElement) {
    return true
  }
  if (el instanceof HTMLButtonElement) {
    return true
  }
  if (el instanceof HTMLInputElement) {
    if (el.type === 'hidden') {
      return false
    }
    return true
  }
  if (el.tagName === 'SUMMARY' || el.tagName === 'summary') {
    return true
  }
  return false
}

function labelHasAssociatedOrNestedControl(label: HTMLLabelElement): boolean {
  const doc = label.ownerDocument
  if (label.htmlFor) {
    const t = doc.getElementById(label.htmlFor)
    if (t instanceof Element) {
      return true
    }
  }
  return (
    label.querySelector(
      'input, select, textarea, button, [role=button], [data-infomode-primary-surface]',
    ) !== null
  )
}

/**
 * The browser cannot enumerate `click` listeners. We treat a node as a primary
 * "action" surface for infomode feedback if it is a typical interactive target.
 */
export function nodeIsInfomodePrimaryActionSurface(node: Element): boolean {
  if (node.hasAttribute(DATA_INFOMODE_PRIMARY_SURFACE)) {
    return true
  }
  if (isInertish(node)) {
    return false
  }
  if (isNativeLink(node) || isMapAreaWithHref(node)) {
    return true
  }
  if (isFormControlLike(node)) {
    return true
  }
  if (node instanceof HTMLElement && node.isContentEditable) {
    return true
  }
  if (node instanceof HTMLLabelElement) {
    return labelHasAssociatedOrNestedControl(node)
  }
  if (hasActionRole(node) || isTabindexFocusableForAction(node)) {
    return true
  }
  return false
}

/**
 * From innermost to … but stop before (excluding) the explainer `zoneRoot`.
 * Uses composedPath (shadow-aware); falls back to parentElement walk.
 */
function elementsOnPathBeforeZoneRoot(
  event: Event,
  zoneRoot: HTMLElement,
): Element[] {
  if (typeof event.composedPath === 'function') {
    const path = event.composedPath()
    for (let i = 0; i < path.length; i += 1) {
      if (path[i] === zoneRoot) {
        return path
          .slice(0, i)
          .filter((n): n is Element => n instanceof Element)
      }
    }
  }
  const out: Element[] = []
  let el: Element | null =
    event.target instanceof Element ? event.target : null
  while (el && el !== zoneRoot) {
    out.push(el)
    el = el.parentElement
  }
  return out
}

/**
 * `true` when the click is on a surface we consider a "real" app action, so
 * infomode should show suppression feedback (toast + lightbulb).
 */
export function clickTargetWouldActivatePrimaryAction(
  event: Event,
  explainerRoot: HTMLElement,
): boolean {
  for (const el of elementsOnPathBeforeZoneRoot(event, explainerRoot)) {
    if (nodeIsInfomodePrimaryActionSurface(el)) {
      return true
    }
  }
  return false
}
