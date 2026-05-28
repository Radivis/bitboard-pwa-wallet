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

function isInertish(element: Element): boolean {
  if (element.getAttribute('aria-disabled') === 'true') {
    return true
  }
  if (element.closest('fieldset[disabled]') !== null) {
    return true
  }
  if ('disabled' in element && (element as HTMLInputElement & { disabled?: boolean }).disabled === true) {
    return true
  }
  return false
}

function hasActionRole(element: Element): boolean {
  const role = element.getAttribute('role')
  if (!role) {
    return false
  }
  return ARIA_ROLES_ACTION.has(role.trim().toLowerCase())
}

function isTabindexFocusableForAction(element: Element): boolean {
  if (!element.hasAttribute('tabindex')) {
    return false
  }
  const tabindexRaw = element.getAttribute('tabindex')?.trim() ?? ''
  if (tabindexRaw === '-1' || tabindexRaw === '') {
    return false
  }
  const tabindexNumber = Number.parseInt(tabindexRaw, 10)
  return tabindexNumber >= 0
}

function isNativeLink(element: Element): boolean {
  if (element.tagName !== 'A' && element.tagName !== 'a') {
    return false
  }
  return element.hasAttribute('href') && (element.getAttribute('href') ?? '') !== ''
}

function isMapAreaWithHref(element: Element): boolean {
  if (element.tagName !== 'AREA' && element.tagName !== 'area') {
    return false
  }
  return element.hasAttribute('href') && (element.getAttribute('href') ?? '') !== ''
}

function isFormControlLike(element: Element): boolean {
  if (element instanceof HTMLTextAreaElement) {
    return true
  }
  if (element instanceof HTMLSelectElement) {
    return true
  }
  if (element instanceof HTMLOptionElement) {
    return true
  }
  if (element instanceof HTMLButtonElement) {
    return true
  }
  if (element instanceof HTMLInputElement) {
    if (element.type === 'hidden') {
      return false
    }
    return true
  }
  if (element.tagName === 'SUMMARY' || element.tagName === 'summary') {
    return true
  }
  return false
}

function labelHasAssociatedOrNestedControl(label: HTMLLabelElement): boolean {
  const doc = label.ownerDocument
  if (label.htmlFor) {
    const labelTarget = doc.getElementById(label.htmlFor)
    if (labelTarget instanceof Element) {
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
          .filter((pathNode): pathNode is Element => pathNode instanceof Element)
      }
    }
  }
  const out: Element[] = []
  let currentElement: Element | null =
    event.target instanceof Element ? event.target : null
  while (currentElement && currentElement !== zoneRoot) {
    out.push(currentElement)
    currentElement = currentElement.parentElement
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
  for (const pathElement of elementsOnPathBeforeZoneRoot(event, explainerRoot)) {
    if (nodeIsInfomodePrimaryActionSurface(pathElement)) {
      return true
    }
  }
  return false
}
