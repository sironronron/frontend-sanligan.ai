import {
  FileTextIcon,
  ListChecksIcon,
  MessagesSquareIcon,
  SearchIcon,
} from '@lucide/vue'
import type { Component } from 'vue'

/**
 * A thread's purpose usually says what kind of work it carries, so the list
 * can hint at that with an icon instead of reading every row. The mapping is
 * deliberately loose — these are user-typed purposes, not an enum.
 */
export type ThreadPurposeKind = 'draft' | 'research' | 'summarize' | 'other'

export function threadPurposeKind(purpose: string | null | undefined): ThreadPurposeKind {
  const value = (purpose ?? '').toLowerCase()
  if (/draft|letter|motion|complaint|demand|pleading|document/i.test(value)) return 'draft'
  if (/research|legal|law|statute|citation|jurisprudence/i.test(value)) return 'research'
  if (/summar|brief|facts|digest/i.test(value)) return 'summarize'
  return 'other'
}

export const THREAD_ICONS: Record<ThreadPurposeKind, Component> = {
  draft: FileTextIcon,
  research: SearchIcon,
  summarize: ListChecksIcon,
  other: MessagesSquareIcon,
}

/** Tones lean on token pairs so the tile stays distinct in both themes. */
export const THREAD_TILES: Record<ThreadPurposeKind, string> = {
  draft: 'bg-secondary text-secondary-foreground',
  research: 'bg-primary/10 text-primary',
  summarize: 'bg-accent text-accent-foreground',
  other: 'bg-muted text-muted-foreground',
}