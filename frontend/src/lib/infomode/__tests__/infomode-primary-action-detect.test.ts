import { afterEach, describe, expect, it } from 'vitest'
import {
  clickTargetWouldActivatePrimaryAction,
  DATA_INFOMODE_PRIMARY_SURFACE,
  nodeIsInfomodePrimaryActionSurface,
} from '@/lib/infomode/infomode-primary-action-detect'

function dispatchClick(target: Element): MouseEvent {
  const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true })
  target.dispatchEvent(clickEvent)
  return clickEvent
}

describe('nodeIsInfomodePrimaryActionSurface', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('is false for non-interactive text container', () => {
    const paragraph = document.createElement('p')
    paragraph.textContent = 'Select the Bitcoin network to connect to.'
    document.body.appendChild(paragraph)
    expect(nodeIsInfomodePrimaryActionSurface(paragraph)).toBe(false)
  })

  it('is true for a button and false when disabled', () => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = 'Go'
    document.body.appendChild(button)
    expect(nodeIsInfomodePrimaryActionSurface(button)).toBe(true)
    button.disabled = true
    expect(nodeIsInfomodePrimaryActionSurface(button)).toBe(false)
  })

  it('is true for a[href] and false for a without href', () => {
    const a1 = document.createElement('a')
    a1.href = '/x'
    a1.textContent = 'Link'
    document.body.appendChild(a1)
    expect(nodeIsInfomodePrimaryActionSurface(a1)).toBe(true)
    a1.remove()
    const a2 = document.createElement('a')
    a2.textContent = 'No href'
    document.body.appendChild(a2)
    expect(nodeIsInfomodePrimaryActionSurface(a2)).toBe(false)
  })

  it('is true for role=button on div', () => {
    const divWithButtonRole = document.createElement('div')
    divWithButtonRole.setAttribute('role', 'button')
    document.body.appendChild(divWithButtonRole)
    expect(nodeIsInfomodePrimaryActionSurface(divWithButtonRole)).toBe(true)
  })

  it('is true when data-infomode-primary-surface is set on a div', () => {
    const primarySurfaceDiv = document.createElement('div')
    primarySurfaceDiv.setAttribute(DATA_INFOMODE_PRIMARY_SURFACE, '')
    document.body.appendChild(primarySurfaceDiv)
    expect(nodeIsInfomodePrimaryActionSurface(primarySurfaceDiv)).toBe(true)
  })

  it('is false for aria-disabled button', () => {
    const disabledButton = document.createElement('button')
    disabledButton.type = 'button'
    disabledButton.setAttribute('aria-disabled', 'true')
    document.body.appendChild(disabledButton)
    expect(nodeIsInfomodePrimaryActionSurface(disabledButton)).toBe(false)
  })
})

describe('clickTargetWouldActivatePrimaryAction', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('is false for click on p inside zone, true for click on button inside zone', () => {
    const zone = document.createElement('div')
    zone.setAttribute('data-infomode-id', 'z')
    const paragraph = document.createElement('p')
    paragraph.textContent = 'Help'
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = 'Act'
    zone.append(paragraph, button)
    document.body.appendChild(zone)

    const paragraphClick = dispatchClick(paragraph)
    expect(clickTargetWouldActivatePrimaryAction(paragraphClick, zone)).toBe(false)

    const buttonClick = dispatchClick(button)
    expect(clickTargetWouldActivatePrimaryAction(buttonClick, zone)).toBe(true)
  })

  it('is true for nested path (span inside button)', () => {
    const zone = document.createElement('div')
    zone.setAttribute('data-infomode-id', 'z')
    const button = document.createElement('button')
    button.type = 'button'
    const labelSpan = document.createElement('span')
    labelSpan.textContent = 'L'
    button.append(labelSpan)
    zone.append(button)
    document.body.appendChild(zone)

    const spanClick = dispatchClick(labelSpan)
    expect(clickTargetWouldActivatePrimaryAction(spanClick, zone)).toBe(true)
  })
})
