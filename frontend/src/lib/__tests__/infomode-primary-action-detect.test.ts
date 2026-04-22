import { afterEach, describe, expect, it } from 'vitest'
import {
  clickTargetWouldActivatePrimaryAction,
  DATA_INFOMODE_PRIMARY_SURFACE,
  nodeIsInfomodePrimaryActionSurface,
} from '@/lib/infomode-primary-action-detect'

function dispatchClick(target: Element): MouseEvent {
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true })
  target.dispatchEvent(ev)
  return ev
}

describe('nodeIsInfomodePrimaryActionSurface', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('is false for non-interactive text container', () => {
    const p = document.createElement('p')
    p.textContent = 'Select the Bitcoin network to connect to.'
    document.body.appendChild(p)
    expect(nodeIsInfomodePrimaryActionSurface(p)).toBe(false)
  })

  it('is true for a button and false when disabled', () => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = 'Go'
    document.body.appendChild(b)
    expect(nodeIsInfomodePrimaryActionSurface(b)).toBe(true)
    b.disabled = true
    expect(nodeIsInfomodePrimaryActionSurface(b)).toBe(false)
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
    const d = document.createElement('div')
    d.setAttribute('role', 'button')
    document.body.appendChild(d)
    expect(nodeIsInfomodePrimaryActionSurface(d)).toBe(true)
  })

  it('is true when data-infomode-primary-surface is set on a div', () => {
    const d = document.createElement('div')
    d.setAttribute(DATA_INFOMODE_PRIMARY_SURFACE, '')
    document.body.appendChild(d)
    expect(nodeIsInfomodePrimaryActionSurface(d)).toBe(true)
  })

  it('is false for aria-disabled button', () => {
    const b = document.createElement('button')
    b.type = 'button'
    b.setAttribute('aria-disabled', 'true')
    document.body.appendChild(b)
    expect(nodeIsInfomodePrimaryActionSurface(b)).toBe(false)
  })
})

describe('clickTargetWouldActivatePrimaryAction', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('is false for click on p inside zone, true for click on button inside zone', () => {
    const zone = document.createElement('div')
    zone.setAttribute('data-infomode-id', 'z')
    const p = document.createElement('p')
    p.textContent = 'Help'
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = 'Act'
    zone.append(p, b)
    document.body.appendChild(zone)

    const evP = dispatchClick(p)
    expect(clickTargetWouldActivatePrimaryAction(evP, zone)).toBe(false)

    const evB = dispatchClick(b)
    expect(clickTargetWouldActivatePrimaryAction(evB, zone)).toBe(true)
  })

  it('is true for nested path (span inside button)', () => {
    const zone = document.createElement('div')
    zone.setAttribute('data-infomode-id', 'z')
    const b = document.createElement('button')
    b.type = 'button'
    const s = document.createElement('span')
    s.textContent = 'L'
    b.append(s)
    zone.append(b)
    document.body.appendChild(zone)

    const ev = dispatchClick(s)
    expect(clickTargetWouldActivatePrimaryAction(ev, zone)).toBe(true)
  })
})
