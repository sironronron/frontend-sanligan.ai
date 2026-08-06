<script setup lang="ts">
import { ClipboardListIcon, PlusIcon, XIcon } from '@lucide/vue'
import { CASE_PRIORITIES, CASE_STATUSES, CASE_TYPES } from '~/stores/cases'

export interface IntakeTemplateOption {
  id: string
  name: string
  category: string
}

export interface CaseIntakePayload {
  title: string
  case_type: string
  reference?: string | null
  priority?: string | null
  status: string
  description?: string | null
  related_parties?: string[]
  due_date?: string | null
  tags?: string[]
  default_template_id?: string | null
}

const props = defineProps<{
  initial?: Partial<CaseIntakePayload> | null
  templates?: IntakeTemplateOption[]
  submitLabel?: string
}>()

const emit = defineEmits<{
  submit: [payload: CaseIntakePayload]
  cancel: []
}>()

interface IntakeFormState {
  title: string
  case_type: string
  reference: string
  priority: string
  status: string
  description: string
  related_parties: string[]
  due_date: string
  tags: string[]
  default_template_id: string
}

const NO_TEMPLATE = 'none'

const form = reactive<IntakeFormState>({
  title: props.initial?.title ?? '',
  case_type: props.initial?.case_type ?? 'legal',
  reference: props.initial?.reference ?? '',
  priority: props.initial?.priority ?? 'medium',
  status: props.initial?.status ?? 'open',
  description: props.initial?.description ?? '',
  related_parties: props.initial?.related_parties?.length ? [...props.initial.related_parties] : [''],
  due_date: props.initial?.due_date ?? '',
  tags: props.initial?.tags ?? [],
  default_template_id: props.initial?.default_template_id ?? NO_TEMPLATE,
})

const tagInput = ref('')
const validationError = ref('')

function addParty() {
  form.related_parties = [...form.related_parties, '']
}

function removeParty(index: number) {
  if (form.related_parties.length > 1) {
    form.related_parties = form.related_parties.filter((_, i) => i !== index)
  }
}

function addTag() {
  const tag = tagInput.value.trim()
  if (!tag) return
  if (!form.tags.includes(tag)) {
    form.tags = [...form.tags, tag]
  }
  tagInput.value = ''
}

function removeTag(tag: string) {
  form.tags = form.tags.filter((t) => t !== tag)
}

function handleKeydownTag(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault()
    addTag()
  }
}

function handleSubmit() {
  const title = form.title.trim()
  if (!title) {
    validationError.value = 'A case title is required.'
    return
  }

  validationError.value = ''

  const payload: CaseIntakePayload = {
    title,
    case_type: form.case_type,
    status: form.status,
    priority: form.priority || null,
    reference: form.reference.trim() ? form.reference.trim() : null,
    description: form.description.trim() ? form.description.trim() : null,
    related_parties: form.related_parties.map((party) => party.trim()).filter(Boolean),
    due_date: form.due_date || null,
    tags: form.tags.filter(Boolean),
    default_template_id: form.default_template_id && form.default_template_id !== NO_TEMPLATE ? form.default_template_id : null,
  }

  emit('submit', payload)
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-[2px]" @click="emit('cancel')" />
      <div class="absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-2xl border-t bg-background shadow-2xl lg:inset-x-auto lg:right-0 lg:top-0 lg:bottom-0 lg:max-h-none lg:w-[480px] lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-xl">
        <div class="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/25 lg:hidden" />
        <div class="flex items-center justify-between border-b px-4 py-3">
          <div class="flex items-center gap-2">
            <ClipboardListIcon class="size-4 text-primary" />
            <h3 class="text-sm font-semibold">{{ props.initial ? 'Edit Case' : 'New Case' }}</h3>
          </div>
          <Button variant="ghost" size="icon" class="size-7" @click="emit('cancel')">
            <XIcon class="size-4" />
          </Button>
        </div>

        <form class="flex-1 space-y-4 overflow-y-auto px-4 pb-2 pt-3" @submit.prevent="handleSubmit">
          <div class="space-y-1.5">
            <Label for="case-title" class="text-xs">
              Case Title <span class="text-destructive">*</span>
            </Label>
            <Input id="case-title" v-model="form.title" class="text-sm" placeholder="e.g. Unpaid rent — Dela Cruz" />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label for="case-type" class="text-xs">
                Case Type <span class="text-destructive">*</span>
              </Label>
              <Select v-model="form.case_type">
                <SelectTrigger id="case-type" class="w-full text-sm">
                  <SelectValue :placeholder="'Select case type'" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="type in CASE_TYPES" :key="type.value" :value="type.value">
                    {{ type.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div class="space-y-1.5">
              <Label for="case-status" class="text-xs">
                Status <span class="text-destructive">*</span>
              </Label>
              <Select v-model="form.status">
                <SelectTrigger id="case-status" class="w-full text-sm">
                  <SelectValue :placeholder="'Select status'" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="status in CASE_STATUSES" :key="status.value" :value="status.value">
                    {{ status.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label for="case-reference" class="text-xs">Case Reference</Label>
              <Input id="case-reference" v-model="form.reference" class="text-sm" placeholder="Auto-generated if blank" />
            </div>

            <div class="space-y-1.5">
              <Label for="case-priority" class="text-xs">Priority</Label>
              <Select v-model="form.priority">
                <SelectTrigger id="case-priority" class="w-full text-sm">
                  <SelectValue :placeholder="'Select priority'" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="priority in CASE_PRIORITIES" :key="priority.value" :value="priority.value">
                    {{ priority.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div class="space-y-1.5">
            <Label for="case-description" class="text-xs">Description / Summary</Label>
            <Textarea
              id="case-description"
              v-model="form.description"
              rows="3"
              class="resize-none text-sm"
              placeholder="Freeform context that becomes part of the case background for the AI."
            />
          </div>

          <div class="space-y-1.5">
            <Label class="text-xs">Related Parties</Label>
            <div v-for="(party, index) in form.related_parties" :key="index" class="flex items-center gap-2">
              <Input v-model="form.related_parties[index]" class="text-sm" placeholder="Name and role, e.g. Maria Santos (claimant)" />
              <Button type="button" variant="ghost" size="icon" class="size-8 shrink-0" :disabled="(form.related_parties ?? []).length === 1" @click="removeParty(index)">
                <XIcon class="size-3.5" />
              </Button>
            </div>
            <Button type="button" variant="outline" size="sm" class="gap-1 text-xs" @click="addParty">
              <PlusIcon class="size-3.5" />
              Add party
            </Button>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label for="case-due-date" class="text-xs">Due Date / Deadline</Label>
              <Input id="case-due-date" v-model="form.due_date" type="date" class="text-sm" />
            </div>

            <div class="space-y-1.5">
              <Label for="case-template" class="text-xs">Default Template</Label>
              <Select v-model="form.default_template_id">
                <SelectTrigger id="case-template" class="w-full text-sm">
                  <SelectValue :placeholder="'None'" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem :value="NO_TEMPLATE">None</SelectItem>
                  <SelectItem v-for="template in props.templates ?? []" :key="template.id" :value="template.id">
                    {{ template.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div class="space-y-1.5">
            <Label for="case-tags" class="text-xs">Tags</Label>
            <div class="flex flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5">
              <span
                v-for="tag in form.tags"
                :key="tag"
                class="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
              >
                {{ tag }}
                <button type="button" class="text-muted-foreground hover:text-destructive" @click="removeTag(tag)">
                  <XIcon class="size-3" />
                </button>
              </span>
              <input
                v-model="tagInput"
                class="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Type a tag and press Enter"
                @keydown="handleKeydownTag"
              />
            </div>
          </div>

          <p v-if="validationError" class="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {{ validationError }}
          </p>

          <div class="sticky bottom-0 -mx-4 mt-1 flex gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur">
            <Button type="button" variant="outline" class="flex-1" @click="emit('cancel')">
              Cancel
            </Button>
            <Button type="submit" class="flex-1">
              {{ props.submitLabel ?? 'Create Case' }}
            </Button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
