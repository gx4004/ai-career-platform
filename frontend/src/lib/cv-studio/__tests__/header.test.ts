import { describe, expect, it } from 'vitest'
import { EMPTY_HEADER, buildPaperHeader, describeHeader, toSavableHeader } from '../header'

const full = {
  name: 'Ada Lovelace', headline: 'Analyst', email: 'ada@example.com', phone: '+44 20 7946 0958', location: 'London, UK',
  links: ['https://github.com/ada', 'https://linkedin.com/in/ada'],
}

describe('buildPaperHeader', () => {
  it('orders the contact line email, phone, location, links like the exports', () => {
    expect(buildPaperHeader(full, 'My CV')).toEqual({
      title: 'Ada Lovelace', headline: 'Analyst',
      contact: ['ada@example.com', '+44 20 7946 0958', 'London, UK', 'https://github.com/ada', 'https://linkedin.com/in/ada'],
    })
  })

  it('falls back to the document name, so an empty header changes nothing on the paper', () => {
    expect(buildPaperHeader(EMPTY_HEADER, '  Principal CV ')).toEqual({ title: 'Principal CV', headline: null, contact: [] })
    expect(buildPaperHeader(undefined, '')).toEqual({ title: 'Untitled CV', headline: null, contact: [] })
  })

  it('treats blank and whitespace-only fields as unset and collapses runs of spaces', () => {
    expect(buildPaperHeader({ ...full, name: '   ', headline: ' ', email: null, phone: ' 555   0100 ', links: ['', '  '] }, 'CV'))
      .toEqual({ title: 'CV', headline: null, contact: ['555 0100', 'London, UK'] })
  })
})

describe('toSavableHeader', () => {
  it('sends blank fields as null and drops blank or surplus links', () => {
    expect(toSavableHeader({ ...EMPTY_HEADER, name: ' Ada ', email: '', links: ['a', '', ' b ', 'c', 'd', 'e', 'f', 'g'] }))
      .toEqual({ name: 'Ada', headline: null, email: null, phone: null, location: null, links: ['a', 'b', 'c', 'd', 'e', 'f'] })
    expect(toSavableHeader(undefined)).toEqual(EMPTY_HEADER)
  })
})

describe('describeHeader', () => {
  it('counts what the header carries', () => {
    expect(describeHeader(full, 'CV')).toBe('6 details')
    expect(describeHeader({ ...EMPTY_HEADER, name: 'Ada' }, 'CV')).toBe('Name only')
    expect(describeHeader(EMPTY_HEADER, 'CV')).toBe('Add your name and contact details')
  })
})
