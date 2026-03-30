import { useRef, useEffect } from 'react'

interface FilterChip {
  id: string
  label: string
}

interface FilterChipsProps {
  chips: FilterChip[]
  activeId: string | null
  onSelect: (id: string | null) => void
}

export function FilterChips({ chips, activeId, onSelect }: FilterChipsProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  // Scroll active chip into view
  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      activeRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    }
  }, [activeId])

  return (
    <div className="filter-chips-scroll" ref={scrollRef}>
      <button
        type="button"
        className={`filter-chip${activeId === null ? ' is-active' : ''}`}
        onClick={() => onSelect(null)}
        ref={activeId === null ? activeRef : undefined}
      >
        All
      </button>
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          className={`filter-chip${activeId === chip.id ? ' is-active' : ''}`}
          onClick={() => onSelect(chip.id)}
          ref={activeId === chip.id ? activeRef : undefined}
        >
          {chip.label}
        </button>
      ))}
    </div>
  )
}
