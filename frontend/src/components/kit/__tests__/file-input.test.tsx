import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Avatar, Field, FileInput, initialsOf } from '#/components/kit'

const pdf = (name = 'resume.pdf', size = 2048) => new File([new Uint8Array(size)], name, { type: 'application/pdf' })

function pick(input: HTMLElement, ...files: File[]) {
  fireEvent.change(input, { target: { files } })
}

describe('kit FileInput', () => {
  it('is a real file input, kept in the tab order, behind a button-looking trigger', () => {
    render(<FileInput aria-label="Resume" accept=".pdf" hint="PDF, up to 5 MB" />)
    const input = screen.getByLabelText('Resume') as HTMLInputElement
    expect(input.type).toBe('file')
    expect(input.accept).toBe('.pdf')
    expect(input.tabIndex).toBe(0)
    const trigger = screen.getByText('Choose file').closest('label') as HTMLLabelElement
    expect(trigger.htmlFor).toBe(input.id)
    expect(trigger.className).toContain('kit-button')
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByText('PDF, up to 5 MB').id)
  })

  it('is named by the Field label first, then the trigger text', () => {
    render(
      <Field label="Resume" error="Too large.">
        <FileInput />
      </Field>,
    )
    // Native file inputs expose no stable role in jsdom: assert the wiring that builds the name instead.
    const file = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(file.getAttribute('aria-labelledby')).toMatch(/-label .*-trigger$/)
    expect(file.getAttribute('aria-invalid')).toBe('true')
  })

  it('shows the chosen file name and size, reports it, and removes it again', () => {
    const onFilesChange = vi.fn()
    const onChange = vi.fn()
    render(<FileInput aria-label="Resume" onFilesChange={onFilesChange} onChange={onChange} hint="PDF" />)
    const input = screen.getByLabelText('Resume')
    pick(input, pdf('cv.pdf', 3 * 1024))
    expect(screen.getByText('cv.pdf')).toBeTruthy()
    expect(screen.getByText('3 KB')).toBeTruthy()
    expect(screen.queryByText('PDF')).toBeNull()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onFilesChange.mock.calls[0][0][0].name).toBe('cv.pdf')

    fireEvent.click(screen.getByRole('button', { name: 'Remove file' }))
    expect(onFilesChange).toHaveBeenLastCalledWith([])
    expect(screen.queryByText('cv.pdf')).toBeNull()
    expect(screen.getByText('PDF')).toBeTruthy()
    expect(document.activeElement).toBe(input)
  })

  it('summarises several files', () => {
    render(<FileInput aria-label="Attachments" multiple />)
    expect(screen.getByText('Choose files')).toBeTruthy()
    pick(screen.getByLabelText('Attachments'), pdf('a.pdf', 1024), pdf('b.pdf', 1024))
    expect(screen.getByText('2 files')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove files' })).toBeTruthy()
  })

  it('disabled: no remove button, trigger marked disabled', () => {
    render(<FileInput aria-label="Locked" disabled />)
    expect((screen.getByLabelText('Locked') as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText('Choose file').closest('label')?.getAttribute('data-disabled')).toBe('true')
  })

  it('dropzone marks itself while a file is dragged over it', () => {
    const { container } = render(<FileInput variant="dropzone" aria-label="Drop" />)
    const zone = container.firstElementChild as HTMLElement
    fireEvent.dragOver(zone)
    expect(zone.hasAttribute('data-dragging')).toBe(true)
    fireEvent.dragLeave(zone)
    expect(zone.hasAttribute('data-dragging')).toBe(false)
  })
})

describe('kit Avatar', () => {
  it('derives initials from names and emails', () => {
    expect(initialsOf('Ada Lovelace')).toBe('AL')
    expect(initialsOf('Cher')).toBe('C')
    expect(initialsOf('grace.hopper@example.com')).toBe('GH')
    expect(initialsOf('   ')).toBe('?')
  })

  it('is an image named after the person, or hidden when decorative', () => {
    const { rerender } = render(<Avatar name="Ada Lovelace" />)
    expect(screen.getByRole('img', { name: 'Ada Lovelace' }).textContent).toBe('AL')
    rerender(<Avatar name="Ada Lovelace" decorative />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(document.querySelector('.kit-avatar')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('size is a data attribute', () => {
    render(<Avatar name="Ada Lovelace" size="lg" />)
    expect(document.querySelector('.kit-avatar')?.getAttribute('data-size')).toBe('lg')
  })
})
