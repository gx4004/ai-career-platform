import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Checkbox, Field, Input, Segmented, Select, Textarea } from '#/components/kit'

describe('kit Field', () => {
  it('labels its control through htmlFor/id', () => {
    render(
      <Field label="Email">
        <Input />
      </Field>,
    )
    const input = screen.getByLabelText('Email')
    expect(input.tagName).toBe('INPUT')
    expect(screen.getByText('Email').getAttribute('for')).toBe(input.id)
  })

  it('wires help into aria-describedby', () => {
    render(
      <Field label="Phone" help="Shown on your CV.">
        <Input />
      </Field>,
    )
    const input = screen.getByLabelText('Phone')
    const help = screen.getByText('Shown on your CV.')
    expect(input.getAttribute('aria-describedby')).toBe(help.id)
    expect(input.getAttribute('aria-invalid')).toBeNull()
  })

  it('marks the control invalid, describes it by help and error, and announces the error', () => {
    render(
      <Field label="Password" help="At least 8 characters." error="Too short.">
        <Input />
      </Field>,
    )
    const input = screen.getByLabelText('Password')
    const help = screen.getByText('At least 8 characters.')
    const error = screen.getByRole('alert')
    expect(error.textContent).toBe('Too short.')
    // The error is text plus a decorative alert icon: never colour alone.
    expect(error.querySelector('svg[aria-hidden="true"]')).toBeTruthy()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe(`${help.id} ${error.id}`)
  })

  it('shows the Optional marker inside the label', () => {
    render(
      <Field label="Bio" optional>
        <Textarea />
      </Field>,
    )
    expect(screen.getByText('Optional')).toBeTruthy()
    expect(screen.getByLabelText(/Bio/).tagName).toBe('TEXTAREA')
  })

  it('passes required and disabled down to the control', () => {
    render(
      <>
        <Field label="Name" required>
          <Input />
        </Field>
        <Field label="Account" disabled>
          <Input />
        </Field>
      </>,
    )
    expect((screen.getByLabelText('Name') as HTMLInputElement).required).toBe(true)
    expect((screen.getByLabelText('Account') as HTMLInputElement).disabled).toBe(true)
  })

  it('keeps a hidden label available to assistive tech', () => {
    render(
      <Field label="Search jobs" hideLabel>
        <Input />
      </Field>,
    )
    const label = screen.getByText('Search jobs')
    expect(label.classList.contains('kit-sr-only')).toBe(true)
    expect(screen.getByLabelText('Search jobs')).toBeTruthy()
  })

  it('works with Select and Textarea', () => {
    render(
      <>
        <Field label="Stage" error="Pick one.">
          <Select defaultValue="">
            <option value="">Choose</option>
          </Select>
        </Field>
        <Field label="Notes" help="Private.">
          <Textarea />
        </Field>
      </>,
    )
    const select = screen.getByLabelText('Stage')
    expect(select.tagName).toBe('SELECT')
    expect(select.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByLabelText('Notes').getAttribute('aria-describedby')).toBeTruthy()
  })

  it('lets explicit control props win over the Field', () => {
    render(
      <Field label="Email" error="Bad" required>
        <Input id="custom" invalid={false} required={false} aria-describedby="mine" />
      </Field>,
    )
    const input = document.getElementById('custom') as HTMLInputElement
    expect(input.getAttribute('aria-invalid')).toBeNull()
    expect(input.required).toBe(false)
    expect(input.getAttribute('aria-describedby')?.split(' ')[0]).toBe('mine')
  })

  it('describes a checkbox by the Field error without adding a second label', () => {
    render(
      <Field error="Accept the terms to continue.">
        <Checkbox label="I accept the terms" />
      </Field>,
    )
    const checkbox = screen.getByRole('checkbox', { name: 'I accept the terms' })
    expect(checkbox.getAttribute('aria-invalid')).toBe('true')
    expect(checkbox.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id)
  })

  it('names a Segmented group with the Field label', () => {
    render(
      <Field label="Question order">
        <Segmented
          defaultValue="a"
          options={[
            { value: 'a', label: 'Weakest first' },
            { value: 'b', label: 'As asked' },
          ]}
        />
      </Field>,
    )
    expect(screen.getByRole('radiogroup', { name: 'Question order' })).toBeTruthy()
  })
})
