<script setup lang="ts">
import { XIcon } from '@lucide/vue'
import type { Client, ClientInput } from '~/types/client'

const props = defineProps<{ client?: Client | null; busy?: boolean }>()
const emit = defineEmits<{ submit: [payload: ClientInput]; cancel: [] }>()
const form = reactive<ClientInput>({ client_type: 'person', display_name: '', lifecycle: 'prospect', contact: { email: '', phone: '' }, notes: '' })
const errors = reactive<Record<string, string>>({})

watch(() => props.client, (client) => {
  if (!client) return
  Object.assign(form, { client_type: client.client_type, display_name: client.display_name, lifecycle: client.lifecycle, contact: { ...client.contact }, notes: client.notes ?? '' })
}, { immediate: true })

function validate() {
  Object.keys(errors).forEach((key) => delete errors[key])
  if (!form.display_name.trim()) errors.display_name = 'Enter a client name.'
  if (form.display_name.length > 255) errors.display_name = 'Use 255 characters or fewer.'
  if (form.contact?.email && !/^\S+@\S+\.\S+$/.test(form.contact.email)) errors.email = 'Enter a valid email address.'
  if (form.notes && form.notes.length > 5000) errors.notes = 'Use 5,000 characters or fewer.'
  return Object.keys(errors).length === 0
}

function submit() {
  if (!validate()) return
  emit('submit', { ...form, display_name: form.display_name.trim(), contact: { ...form.contact } })
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 p-0 sm:items-center sm:p-4" role="presentation" @keydown.esc="emit('cancel')">
    <section role="dialog" aria-modal="true" aria-labelledby="client-form-title" class="max-h-[100dvh] w-full overflow-y-auto rounded-t-2xl bg-card p-5 shadow-float sm:max-w-xl sm:rounded-2xl sm:p-6">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-label">CRM / Clients</p>
          <h2 id="client-form-title" class="text-h2 font-semibold">{{ client ? 'Edit client' : 'New client' }}</h2>
          <p class="mt-1 text-sm text-muted-foreground">Keep identity and sensitive details in one scoped profile.</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close client form" @click="emit('cancel')"><XIcon class="size-4" /></Button>
      </div>
      <div v-if="Object.keys(errors).length" role="alert" class="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
        Fix the highlighted fields before saving.
      </div>
      <form class="mt-5 space-y-4" @submit.prevent="submit">
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label for="client-type" class="text-sm font-medium">Client type</label>
            <Select v-model="form.client_type">
              <SelectTrigger id="client-type" class="mt-1.5 h-11 w-full">
                <SelectValue placeholder="Select client type" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="person">Person</SelectItem>
                  <SelectItem value="organization">Organization</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label for="client-lifecycle" class="text-sm font-medium">Lifecycle</label>
            <Select v-model="form.lifecycle">
              <SelectTrigger id="client-lifecycle" class="mt-1.5 h-11 w-full">
                <SelectValue placeholder="Select lifecycle" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="prospect">Prospect</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="former">Former</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <label for="client-name" class="text-sm font-medium">Name <span aria-hidden="true">*</span></label>
          <Input id="client-name" v-model="form.display_name" class="mt-1.5 h-11" :aria-invalid="!!errors.display_name" aria-describedby="client-name-error" autocomplete="name" />
          <p v-if="errors.display_name" id="client-name-error" class="mt-1 text-xs text-destructive">{{ errors.display_name }}</p>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div><label for="client-email" class="text-sm font-medium">Email</label><Input id="client-email" v-model="form.contact!.email" type="email" class="mt-1.5 h-11" :aria-invalid="!!errors.email" /><p v-if="errors.email" class="mt-1 text-xs text-destructive">{{ errors.email }}</p></div>
          <div><label for="client-phone" class="text-sm font-medium">Phone</label><Input id="client-phone" v-model="form.contact!.phone" type="tel" class="mt-1.5 h-11" /></div>
        </div>
        <div><label for="client-notes" class="text-sm font-medium">Notes</label><Textarea id="client-notes" v-model="form.notes!" class="mt-1.5 min-h-28" :aria-invalid="!!errors.notes" /><p v-if="errors.notes" class="mt-1 text-xs text-destructive">{{ errors.notes }}</p></div>
        <div class="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" class="min-h-11" :disabled="busy" @click="emit('cancel')">Cancel</Button>
          <Button type="submit" class="min-h-11" :loading="busy">{{ busy ? 'Saving…' : client ? 'Save changes' : 'Create client' }}</Button>
        </div>
      </form>
    </section>
  </div>
</template>
