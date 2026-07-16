/**
 * Link-Schema-Whitelist im Prozess-Markdown-Renderer (Fix 16.07.2026).
 *
 * Der Inline-Link-Renderer darf nur http(s), mailto, Anker (#) und
 * root-relative Pfade (/…) als klickbare Links rendern — javascript:/data:-
 * URLs und protocol-relative //-URLs werden auf reinen Text degradiert.
 * Relevanz: das Help-Center rendert heute eigene Inhalte, aber kuenftige
 * Konsumenten (Mission-Board, Boomy-Quellen) erben den Renderer.
 */
import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../process-markdown'

const render = (md: string) => renderMarkdown(md, [])

describe('process-markdown — Link-Schema-Whitelist', () => {
  it.each([
    ['https://kaboomkartell.com', true],
    ['http://example.org/pfad?q=1', true],
    ['mailto:pack@example.org', true],
    ['/mission', true],
    ['#anker', true],
  ])('erlaubt %s als klickbaren Link', (url) => {
    const html = render(`[click me](${url})`)
    expect(html).toContain(`href="${url}"`)
    expect(html).toContain('rel="noopener"')
  })

  it.each([
    // eslint-disable-next-line no-script-url
    ['javascript:alert(1)'],
    ['data:text/html,<script>x</script>'],
    ['//evil.example.org'],
    ['vbscript:msgbox(1)'],
    ['JavaScript:alert(1)'], // Case-Varianten
  ])('degradiert %s zu reinem Text (kein <a>)', (url) => {
    const html = render(`[click me](${url})`)
    expect(html).not.toContain('<a ')
    expect(html).not.toContain(url.split(':')[0] + ':')
    expect(html).toContain('click me')
  })

  it('laesst den Link-Text bei degradierten Links erhalten (kein Inhaltsverlust)', () => {
    const html = render('Vorher [wichtiger Text](javascript:alert(1)) nachher')
    expect(html).toContain('wichtiger Text')
    expect(html).toContain('Vorher')
    expect(html).toContain('nachher')
  })
})
