import type { ComponentType } from 'react'
import { BadgeSection } from './badge-section'
import { ButtonSection } from './button-section'
import { ChoiceSection } from './choice-section'
import { CompositionSection } from './composition-section'
import { DialogSection } from './dialog-section'
import { DisclosureSection } from './disclosure-section'
import { FieldSection } from './field-section'
import { FloatingSection } from './floating-section'
import { DataSection } from './data-section'
import { JumpNavSection } from './jumpnav-section'
import { ListSection } from './list-section'
import { MenuSection } from './menu-section'
import { PageSection } from './page-section'
import { PanelSection } from './panel-section'
import { SealSection } from './seal-section'
import { SegmentedSection } from './segmented-section'
import { SheetSection } from './sheet-section'
import { StateSection } from './state-section'
import { StickerSection } from './sticker-section'
import { SurfaceSection } from './surface-section'
import { TableSection } from './table-section'
import { TabsSection } from './tabs-section'
import { TilesSection } from './tiles-section'
import { ToastSection } from './toast-section'
import { ToolbarSection } from './toolbar-section'

/** One entry per gallery section, in page order. New kit families add themselves here. */
export const KIT_SECTIONS: Array<{ id: string; label: string; Component: ComponentType }> = [
  { id: 'button', label: 'Button', Component: ButtonSection },
  { id: 'badge', label: 'Badge, Count, Kbd', Component: BadgeSection },
  { id: 'field', label: 'Field and inputs', Component: FieldSection },
  { id: 'choice', label: 'Checkbox, Switch, Radio', Component: ChoiceSection },
  { id: 'segmented', label: 'Segmented', Component: SegmentedSection },
  { id: 'dialog', label: 'Dialog', Component: DialogSection },
  { id: 'sheet', label: 'Sheet', Component: SheetSection },
  { id: 'menu', label: 'Dropdown menu', Component: MenuSection },
  { id: 'floating', label: 'Popover, Tooltip', Component: FloatingSection },
  { id: 'toast', label: 'Toast', Component: ToastSection },
  { id: 'tabs', label: 'Tabs', Component: TabsSection },
  { id: 'disclosure', label: 'Disclosure', Component: DisclosureSection },
  { id: 'page', label: 'Page, header, split', Component: PageSection },
  { id: 'data', label: 'MetaRow, KeyValue, Stat, ScoreBar', Component: DataSection },
  { id: 'surface', label: 'Section, Notice, Card', Component: SurfaceSection },
  { id: 'list', label: 'List, Row', Component: ListSection },
  { id: 'table', label: 'Table', Component: TableSection },
  { id: 'toolbar', label: 'Toolbar, Pagination', Component: ToolbarSection },
  { id: 'state', label: 'Empty, Error, Skeleton', Component: StateSection },
  { id: 'sticker', label: 'Sticker', Component: StickerSection },
  { id: 'seal', label: 'ScoreSeal', Component: SealSection },
  { id: 'tiles', label: 'Tiles and stamps', Component: TilesSection },
  { id: 'panel', label: 'Panel', Component: PanelSection },
  { id: 'jumpnav', label: 'JumpNav', Component: JumpNavSection },
  { id: 'composition', label: 'Composition', Component: CompositionSection },
]
