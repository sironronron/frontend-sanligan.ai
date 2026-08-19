import { Extension, type Editor, type Range } from '@tiptap/core'
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion'
import { VueRenderer } from '@tiptap/vue-3'
import {
  BoldIcon,
  Heading1Icon,
  Heading2Icon,
  HighlighterIcon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  PenLineIcon,
  PilcrowIcon,
} from '@lucide/vue'
import type { Component } from 'vue'
import SlashCommandList from '~/components/editor/SlashCommandList.vue'

export interface SlashCommandItem {
  title: string
  description?: string
  searchTerms?: string[]
  icon?: Component
  command: (props: { editor: Editor; range: Range }) => void
}

const COMMANDS: SlashCommandItem[] = [
  {
    title: 'Heading 1',
    description: 'A section title',
    searchTerms: ['title', 'header', 'h1'],
    icon: Heading1Icon,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
  },
  {
    title: 'Heading 2',
    description: 'A smaller section title',
    searchTerms: ['subtitle', 'header', 'h2'],
    icon: Heading2Icon,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
  },
  {
    title: 'Paragraph',
    description: 'Plain body text',
    searchTerms: ['text', 'body'],
    icon: PilcrowIcon,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    title: 'Bold',
    description: 'Emphasize selected text',
    searchTerms: ['strong', 'emphasis'],
    icon: BoldIcon,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleMark('bold').run(),
  },
  {
    title: 'Italic',
    description: 'Slanted emphasis',
    searchTerms: ['emphasis', 'em'],
    icon: ItalicIcon,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleMark('italic').run(),
  },
  {
    title: 'Highlight',
    description: 'Mark text for attention',
    searchTerms: ['marker', 'yellow', 'emphasize'],
    icon: HighlighterIcon,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleHighlight().run(),
  },
  {
    title: 'Bullet list',
    description: 'An unordered list',
    searchTerms: ['ul', 'list', 'bullets'],
    icon: ListIcon,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: 'Numbered list',
    description: 'An ordered list',
    searchTerms: ['ol', 'list', 'numbered'],
    icon: ListOrderedIcon,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: 'Signature',
    description: 'A slot to draw or type your signature',
    searchTerms: ['sign', 'draw'],
    icon: PenLineIcon,
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).insertSignature().run(),
  },
]

function filteredItems(query: string): SlashCommandItem[] {
  const q = query.trim().toLowerCase()

  if (q === '') return COMMANDS

  return COMMANDS.filter((item) => {
    const haystack = [item.title, item.description ?? '', ...(item.searchTerms ?? [])].join(' ').toLowerCase()

    return haystack.includes(q)
  })
}

/**
 * A "/" command menu for the letter editor. Typing a slash opens the list;
 * selecting an item runs its command against the range the slash was typed at.
 * The popup is mounted through SuggestionProps.mount/unmount so the plugin owns
 * its position and lifecycle.
 */
export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return { commands: COMMANDS }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashCommandItem, SlashCommandItem>({
        editor: this.editor,
        char: '/',
        startOfLine: true,
        allowSpaces: false,
        items: ({ query }) => filteredItems(query),
        command: ({ editor, range, props }) => props.command({ editor, range }),
        render: () => {
          let component: VueRenderer | null = null

          return {
            onStart: (props: SuggestionProps<SlashCommandItem, SlashCommandItem>) => {
              component = new VueRenderer(SlashCommandList, {
                editor: props.editor,
                props,
              })
              props.mount(component.element)
            },
            onUpdate: (props: SuggestionProps<SlashCommandItem, SlashCommandItem>) => {
              component?.updateProps(props)
            },
            onKeyDown: (props: SuggestionKeyDownProps) => {
              if (props.event.key === 'Escape') {
                props.hide()
                return true
              }

              return component?.ref?.onKeyDown(props) ?? false
            },
            onExit: (props: SuggestionProps<SlashCommandItem, SlashCommandItem>) => {
              props.unmount()
              component?.destroy()
              component = null
            },
          }
        },
      }),
    ]
  },
})