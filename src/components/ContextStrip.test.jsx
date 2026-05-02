import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ContextStrip from './ContextStrip.jsx'

vi.mock('../supabase.js', () => ({
  getSeason: vi.fn(() => Promise.resolve({ id: 's1', name: 'Spring 2024' })),
}))

vi.mock('./Pill.jsx', () => ({ default: ({ children }) => <span>{children}</span> }))

function makeRoom(overrides = {}) {
  return { seasonId: null, seriesIndex: null, tone: null, ...overrides }
}

// Context visibility smoke tests — intentional exceptions to "UI components don't need tests."
// These verify that ContextStrip returns null or renders the correct sections based on
// props alone. A silent regression (e.g. always returning null) would not be caught by
// playing the game.
//
// Async limitation: renderToStaticMarkup is a synchronous server render; useEffect does not
// run. getSeason is called inside useEffect, so season state is always null at initial render.
// Cases 2 and 3 (season name, "Season · Game N" format) cannot be fully asserted here —
// they require a DOM environment with act(async () => {}). The tests below note this
// limitation and verify what is observable synchronously.
describe('ContextStrip render paths', () => {
  it('returns null when room has no seasonId, no tone, and currentArena is null', () => {
    const html = renderToStaticMarkup(<ContextStrip room={makeRoom()} currentArena={null} />)
    expect(html).toBe('')
  })

  // Case 2: season label — async limitation (see block comment above).
  // getSeason mock resolves to { name: 'Spring 2024' }, but useEffect does not run in
  // renderToStaticMarkup. What we can verify: a room with only seasonId set returns null
  // because season state is null and no tone or arena passes the guard.
  it('returns null when only seasonId is set because season has not yet loaded', () => {
    const html = renderToStaticMarkup(
      <ContextStrip room={makeRoom({ seasonId: 's1' })} currentArena={null} />
    )
    expect(html).toBe('')
  })

  // Case 3: "Season Name · Game N" format — async limitation (see block comment above).
  // The seasonLabel expression ("Spring 2024 · Game 2") is never reached in a static render
  // because season state stays null. Tone is added so the null guard passes and the rest of
  // the component is exercised; the season label is expected to be absent.
  it('does not show season label before getSeason resolves, even when seriesIndex is set', () => {
    const html = renderToStaticMarkup(
      <ContextStrip
        room={makeRoom({ seasonId: 's1', seriesIndex: 2, tone: { tags: ['tag'] } })}
        currentArena={null}
      />
    )
    expect(html).not.toContain('Spring 2024')
    expect(html).not.toContain('Game 2')
    expect(html).toContain('tag')
  })

  it('shows tone tags as pills when room.tone.tags has entries', () => {
    const html = renderToStaticMarkup(
      <ContextStrip room={makeRoom({ tone: { tags: ['Silly', 'Dark'] } })} currentArena={null} />
    )
    expect(html).toContain('Silly')
    expect(html).toContain('Dark')
  })

  it('shows the premise in italics when room.tone.premise is set', () => {
    const html = renderToStaticMarkup(
      <ContextStrip
        room={makeRoom({ tone: { premise: 'Everyone is a superhero' } })}
        currentArena={null}
      />
    )
    expect(html).toContain('Everyone is a superhero')
    expect(html).toContain('italic')
  })

  it('shows "@ Arena Name" when currentArena is passed with a name', () => {
    const html = renderToStaticMarkup(
      <ContextStrip room={makeRoom()} currentArena={{ name: 'The Thunderdome' }} />
    )
    expect(html).toContain('@ The Thunderdome')
  })

  it('renders tone and arena sections when season, tone, and arena are all present', () => {
    // Season label ("Spring 2024") is additionally expected post-getSeason resolution;
    // that assertion requires act(async () => {}) in a DOM environment.
    const html = renderToStaticMarkup(
      <ContextStrip
        room={makeRoom({ seasonId: 's1', tone: { tags: ['Funny'], premise: 'Everyone is cursed' } })}
        currentArena={{ name: 'Colosseum' }}
      />
    )
    expect(html).toContain('Funny')
    expect(html).toContain('Everyone is cursed')
    expect(html).toContain('@ Colosseum')
  })
})
