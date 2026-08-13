import type { Component } from 'vue'
import {
  CalculatorIcon,
  ClockIcon,
  FileTextIcon,
  HelpCircleIcon,
  LandmarkIcon,
  ListChecksIcon,
  ScaleIcon,
  SearchIcon,
  SparklesIcon,
} from '@lucide/vue'
import type { SuggestionIcon } from '~/composables/useChatSuggestions'

/**
 * The icon carries the kind of move a suggestion is — draft, compute, watch a
 * deadline — so a row of them reads at a glance instead of as three sparkles.
 */
const icons: Record<SuggestionIcon, Component> = {
  sparkles: SparklesIcon,
  file: FileTextIcon,
  scale: ScaleIcon,
  clock: ClockIcon,
  checklist: ListChecksIcon,
  search: SearchIcon,
  landmark: LandmarkIcon,
  calculator: CalculatorIcon,
  help: HelpCircleIcon,
}

export function suggestionIcon(name: SuggestionIcon | undefined): Component {
  return (name && icons[name]) || SparklesIcon
}
