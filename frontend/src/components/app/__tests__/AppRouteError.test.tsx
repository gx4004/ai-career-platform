import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppRouteError } from '#/components/app/AppRouteError'

const captureAppErrorMock = vi.hoisted(() => vi.fn())
const appStatePanelProps = vi.hoisted(() => vi.fn())

vi.mock('#/lib/telemetry/client', () => ({
  captureAppError: captureAppErrorMock,
}))

vi.mock('#/components/app/AppStatePanel', () => ({
  AppStatePanel: (props: {
    badge?: string
    title: string
    description: string
    detail?: string
    actions?: Array<{ label: string; onClick?: () => void }>
  }) => {
    appStatePanelProps(props)
    return (
      <div>
        <div>{props.badge}</div>
        <div>{props.title}</div>
        <div>{props.description}</div>
        <div>{props.detail}</div>
        {props.actions?.map((action) => (
          <button key={action.label} type="button" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
      </div>
    )
  },
}))

describe('AppRouteError', () => {
  it('shows a reload-focused message for chunk load failures', () => {
    render(
      <AppRouteError
        error={new TypeError('Failed to fetch dynamically imported module')}
        reset={vi.fn()}
      />,
    )

    expect(screen.getByText(/The app was updated in the background/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Reload app/i })).toBeTruthy()
    expect(captureAppErrorMock).toHaveBeenCalledWith(
      expect.any(TypeError),
      expect.objectContaining({
        source: 'route-error',
        failure_kind: 'chunk-load',
      }),
    )
    expect(appStatePanelProps).toHaveBeenCalledWith(
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({ label: 'Reload app' }),
        ]),
      }),
    )
  })

  it('keeps the generic route error state for non-chunk failures', () => {
    const reset = vi.fn()

    render(
      <AppRouteError
        error={new Error('Server returned 500')}
        reset={reset}
      />,
    )

    expect(screen.getByText(/This route failed to load/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Try again/i })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Try again/i }))

    expect(reset).toHaveBeenCalledTimes(1)
    expect(captureAppErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        source: 'route-error',
        failure_kind: 'generic-route',
      }),
    )
  })
})
