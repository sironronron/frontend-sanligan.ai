<script lang="ts">
/** One decision the model put to the user, as normalized by the server. */
export interface ChoiceQuestion {
  /** Stable key for this question within the set; also the answer's key. */
  id: string
  question: string
  /** 1-3 words naming what is being decided, shown as the chip. */
  header: string
  multi_select?: boolean
  options: { label: string; description?: string }[]
}

export interface ChoiceAnswer {
  id: string
  question: string
  header: string
  /** The labels picked, in the order they were offered. Empty when only "Other" was used. */
  selections: string[]
  /** The user's own answer, when they chose "Other". */
  other: string | null
}

/**
 * The message body carrying the user's answers back to the model.
 *
 * One `Q:`/`A:` pair per question, so a selection is never confused with the
 * question that produced it, and an "Other" answer arrives clearly marked as
 * the user's own words rather than one of the offered labels.
 */
export function formatChoiceSubmission(answers: ChoiceAnswer[]): string {
  const lines = answers.flatMap((answer) => {
    const parts = [...answer.selections]
    if (answer.other) parts.push(`Other: ${answer.other}`)

    return [`Q: ${answer.question}`, `A: ${parts.join(' | ')}`]
  })

  return `[Choice Selection]\n${lines.join('\n')}`
}
</script>

<script setup lang="ts">
import { AlertCircleIcon, ArrowRightIcon, CheckIcon, PencilLineIcon } from '@lucide/vue'

const props = withDefaults(defineProps<{
  questions: ChoiceQuestion[]
  busy?: boolean
}>(), {
  busy: false,
})

const emit = defineEmits<{
  submit: [answers: ChoiceAnswer[]]
}>()

/** The label of the escape hatch. The server strips any option the model wrote under this name. */
const OTHER = 'Other'

/** Picked labels per question. "Other" lives in here too, alongside real options. */
const picked = ref<Record<string, string[]>>({})
const explanations = ref<Record<string, string>>({})
const validationError = ref('')

watch(
  () => props.questions,
  () => {
    picked.value = {}
    explanations.value = {}
    validationError.value = ''
  },
  { immediate: true },
)

function selectionsFor(question: ChoiceQuestion): string[] {
  return picked.value[question.id] ?? []
}

function isPicked(question: ChoiceQuestion, label: string): boolean {
  return selectionsFor(question).includes(label)
}

function choseOther(question: ChoiceQuestion): boolean {
  return isPicked(question, OTHER)
}

function toggle(question: ChoiceQuestion, label: string) {
  const current = selectionsFor(question)

  if (question.multi_select) {
    picked.value[question.id] = current.includes(label)
      ? current.filter((value) => value !== label)
      : [...current, label]
  } else {
    // A single-choice question re-clicked on its own answer keeps it: this is a
    // radio group, and there is no "unanswered" state worth returning to.
    picked.value[question.id] = [label]
  }

  if (!choseOther(question)) explanations.value[question.id] = ''

  validationError.value = ''
}

/** Selections in the order the options were offered, with "Other" last. */
function orderedSelections(question: ChoiceQuestion): string[] {
  const chosen = new Set(selectionsFor(question))

  return question.options.map((option) => option.label).filter((label) => chosen.has(label))
}

const answered = computed(() =>
  props.questions.every((question) => selectionsFor(question).length > 0),
)

/**
 * Arrow keys move between the options of one question, the way a native radio
 * group does. These are buttons rather than inputs — each carries a label and
 * a description, which a radio cannot — so the behaviour a reader expects from
 * a group of choices has to be supplied.
 */
function onOptionKeydown(event: KeyboardEvent, question: ChoiceQuestion, position: number) {
  const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft']
  if (!keys.includes(event.key)) return

  event.preventDefault()

  // The escape hatch is the last stop in the ring, so every answer to the
  // question is reachable without leaving the keyboard.
  const total = question.options.length + 1
  const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1
  const next = (position + step + total) % total

  const group = (event.currentTarget as HTMLElement).closest('[data-options]')

  group?.querySelectorAll<HTMLElement>('[data-option]')[next]?.focus()
}

function handleSubmit() {
  const unanswered = props.questions.filter((question) => selectionsFor(question).length === 0)

  if (unanswered.length > 0) {
    validationError.value = props.questions.length === 1
      ? 'Pick an option to continue.'
      : `Still to answer: ${unanswered.map((question) => question.header).join(', ')}`

    return
  }

  // "Other" without the reason is the one case worth blocking on: it is the
  // only answer that carries no meaning of its own.
  const unexplained = props.questions.filter(
    (question) => choseOther(question) && (explanations.value[question.id] ?? '').trim() === '',
  )

  if (unexplained.length > 0) {
    validationError.value = 'Tell me what you would rather do, so I can act on it.'

    return
  }

  validationError.value = ''

  emit(
    'submit',
    props.questions.map((question) => ({
      id: question.id,
      question: question.question,
      header: question.header,
      selections: orderedSelections(question),
      other: choseOther(question) ? explanations.value[question.id]!.trim() : null,
    })),
  )
}
</script>

<template>
  <section class="batayan-turn-in w-full space-y-4 rounded-2xl border bg-card px-4 py-3.5 shadow-sm">
    <div
      v-for="(question, questionIndex) in questions"
      :key="question.id"
      role="group"
      :aria-label="question.question"
      class="space-y-2"
      :class="questionIndex > 0 ? 'border-t pt-4' : ''"
    >
      <div class="space-y-1.5">
        <div class="flex items-center gap-2">
          <span class="inline-flex items-center rounded-full border border-primary/25 bg-primary/[0.07] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            {{ question.header }}
          </span>
          <!-- Answered state is worth showing on a multi-question set, where
               the reader has to keep track of which ones are still open. -->
          <span
            v-if="questions.length > 1 && selectionsFor(question).length > 0"
            class="inline-flex items-center gap-1 text-[10px] font-medium text-primary"
          >
            <CheckIcon class="size-2.5" />
            Answered
          </span>
        </div>
        <p class="text-sm font-medium leading-snug">{{ question.question }}</p>
        <p v-if="question.multi_select" class="text-[11px] text-muted-foreground">
          Pick as many as apply
        </p>
      </div>

      <div class="space-y-1.5" data-options>
          <button
            v-for="(option, position) in question.options"
            :key="option.label"
            type="button"
            data-option
            :role="question.multi_select ? 'checkbox' : 'radio'"
            :aria-checked="isPicked(question, option.label)"
            :disabled="busy"
            class="flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
            :class="isPicked(question, option.label) ? 'border-primary bg-primary/[0.07]' : 'border-border'"
            @click="toggle(question, option.label)"
            @keydown="onOptionKeydown($event, question, position)"
          >
            <span
              class="mt-0.5 flex size-4 shrink-0 items-center justify-center border transition-colors"
              :class="[
                question.multi_select ? 'rounded' : 'rounded-full',
                isPicked(question, option.label) ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
              ]"
            >
              <CheckIcon v-if="isPicked(question, option.label)" class="size-3" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-medium leading-snug">{{ option.label }}</span>
              <span v-if="option.description" class="mt-0.5 block text-xs leading-snug text-muted-foreground">
                {{ option.description }}
              </span>
            </span>
          </button>

          <!-- Always offered, never sent by the model: the answer it collects is
               the user's own, and it overrides the options above. -->
          <button
            type="button"
            data-option
            :role="question.multi_select ? 'checkbox' : 'radio'"
            :aria-checked="choseOther(question)"
            :disabled="busy"
            class="flex w-full items-start gap-2.5 rounded-xl border border-dashed px-3 py-2.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
            :class="choseOther(question) ? 'border-primary bg-primary/[0.07]' : 'border-border'"
            @click="toggle(question, OTHER)"
            @keydown="onOptionKeydown($event, question, question.options.length)"
          >
            <span
              class="mt-0.5 flex size-4 shrink-0 items-center justify-center border transition-colors"
              :class="[
                question.multi_select ? 'rounded' : 'rounded-full',
                choseOther(question) ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
              ]"
            >
              <CheckIcon v-if="choseOther(question)" class="size-3" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-1.5 text-sm font-medium leading-snug">
                <PencilLineIcon class="size-3.5 text-muted-foreground" />
                Other
              </span>
              <span class="mt-0.5 block text-xs leading-snug text-muted-foreground">
                Something else — say what you'd rather do
              </span>
            </span>
          </button>

        <Textarea
          v-if="choseOther(question)"
          v-model="explanations[question.id]"
          rows="2"
          :disabled="busy"
          class="resize-none text-sm"
          :placeholder="`What would you rather I do about ${question.header.toLowerCase()}?`"
        />
      </div>
    </div>

    <p
      v-if="validationError"
      class="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
      role="alert"
    >
      <AlertCircleIcon class="size-3.5 shrink-0" />
      {{ validationError }}
    </p>

    <div class="flex items-center justify-between gap-3 border-t pt-3">
      <p class="min-w-0 text-[11px] text-muted-foreground">
        {{ answered ? 'Ready to continue' : 'Pick an answer to carry on' }}
      </p>
      <Button size="sm" class="h-8 gap-1.5 px-4 text-xs" :disabled="busy || !answered" @click="handleSubmit">
        {{ busy ? 'Working…' : 'Continue' }}
        <ArrowRightIcon v-if="!busy" class="size-3.5" />
      </Button>
    </div>
  </section>
</template>
