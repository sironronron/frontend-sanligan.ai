<script setup lang="ts">
import {
  BadgeCheckIcon,
  FileUpIcon,
  Loader2Icon,
  MapPinIcon,
  ScaleIcon,
} from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import { parseApiError } from '~/composables/useApiErrors'
import type { LawyerProfileData, LawyerProfileResponse } from '~/types/vetting'

definePageMeta({
  middleware: 'auth',
  layout: 'bare',
})

const api = useApi()
const auth = useAuthStore()

const loading = ref(true)
const loadingProfile = ref(true)
const options = ref<LawyerProfileResponse['meta']>({
  practice_area_options: [],
  region_options: [],
  commission_required: true,
})
const existing = ref<LawyerProfileData | null>(null)
const submitting = ref(false)
const error = ref('')
const fieldErrors = ref<Record<string, string>>({})

const form = reactive({
  full_name: '',
  bar_number: '',
  bar_jurisdiction: '',
  ptr_number: '',
  practice_areas: [] as string[],
  region: '',
  city: '',
  phone: '',
  is_notary: false,
  notarial_commission_number: '',
  notarial_commission_issuer: '',
  notarial_commission_expires_at: '',
  max_concurrent_assignments: 3,
})

const idFile = ref<File | null>(null)
const barFile = ref<File | null>(null)
const idInput = ref<HTMLInputElement | null>(null)
const barInput = ref<HTMLInputElement | null>(null)

/**
 * The register page is shared by first-time applicants and lawyers re-applying
 * after a rejection. A live, verified profile is sent to the workspace and a
 * profile still in review is sent to the waiting screen — only a rejected (or
 * missing) profile stays here.
 */
async function loadProfile() {
  try {
    const res = await api<LawyerProfileResponse>('/lawyer/profile')
    options.value = res.meta
    existing.value = res.data

    if (res.data) {
      if (res.data.verification_status === 'verified') {
        await navigateTo('/lawyer/dashboard')
        return
      }
      if (res.data.verification_status === 'pending') {
        await navigateTo('/lawyer/pending')
        return
      }

      form.full_name = res.data.full_name
      form.bar_number = res.data.bar_number
      form.bar_jurisdiction = res.data.bar_jurisdiction
      form.ptr_number = res.data.ptr_number ?? ''
      form.practice_areas = [...(res.data.practice_areas ?? [])]
      form.region = res.data.region
      form.city = res.data.city ?? ''
      form.phone = res.data.phone ?? ''
      form.is_notary = res.data.is_notary
      form.notarial_commission_number = res.data.notarial_commission_number ?? ''
      form.notarial_commission_issuer = res.data.notarial_commission_issuer ?? ''
      form.notarial_commission_expires_at = res.data.notarial_commission_expires_at ?? ''
      form.max_concurrent_assignments = res.data.max_concurrent_assignments
    }
  } catch (err: any) {
    const parsed = parseApiError(err)
    if (parsed.status !== 404) {
      error.value = parsed.message || 'Could not load your profile.'
    }
  } finally {
    loadingProfile.value = false
    loading.value = false
  }
}

onMounted(() => {
  void loadProfile()
})

function toggleArea(value: string) {
  const index = form.practice_areas.indexOf(value)
  if (index === -1) {
    if (form.practice_areas.length < 12) form.practice_areas.push(value)
  } else {
    form.practice_areas.splice(index, 1)
  }
}

function areaLabel(value: string) {
  return options.value.practice_area_options.find((o) => o.value === value)?.label ?? value
}

function documentsFor(value: string) {
  return options.value.practice_area_options.find((o) => o.value === value)?.documents ?? []
}

function regionLabel(value: string) {
  return options.value.region_options.find((o) => o.value === value)?.label ?? value
}

function onPickId(event: Event) {
  const input = event.target as HTMLInputElement
  idFile.value = input.files?.[0] ?? null
}

function onPickBar(event: Event) {
  const input = event.target as HTMLInputElement
  barFile.value = input.files?.[0] ?? null
}

const fileLabel = (file: File | null, existingHas: boolean) => {
  if (file) return file.name
  if (existingHas) return 'Uploaded — replace with a new file'
  return 'No file selected'
}

async function handleSubmit() {
  if (submitting.value) return

  const errors: Record<string, string> = {}
  if (form.full_name.trim() === '') errors.full_name = 'Enter your full legal name.'
  if (form.bar_number.trim() === '') errors.bar_number = 'Enter your Roll of Attorneys number.'
  if (form.bar_jurisdiction.trim() === '') errors.bar_jurisdiction = 'Enter your bar admission jurisdiction.'
  if (form.practice_areas.length === 0) errors.practice_areas = 'Select at least one practice area.'
  if (form.region === '') errors.region = 'Select your primary region.'
  if (form.is_notary) {
    if (form.notarial_commission_number.trim() === '') errors.notarial_commission_number = 'Enter your notarial commission number.'
    if (form.notarial_commission_issuer.trim() === '') errors.notarial_commission_issuer = 'Enter the commissioning authority.'
    if (form.notarial_commission_expires_at === '') errors.notarial_commission_expires_at = 'Enter your commission expiry.'
  }
  if (!idFile.value && !existing.value?.has_id_document) errors.id_document = 'Upload a government-issued ID.'
  if (!barFile.value && !existing.value?.has_bar_membership_document) errors.bar_membership_document = 'Upload your bar membership certificate.'

  fieldErrors.value = errors

  if (Object.keys(errors).length > 0) {
    error.value = 'Check the highlighted fields below.'
    return
  }

  submitting.value = true
  error.value = ''

  try {
    const body = new FormData()
    body.append('full_name', form.full_name.trim())
    body.append('bar_number', form.bar_number.trim())
    body.append('bar_jurisdiction', form.bar_jurisdiction.trim())
    if (form.ptr_number.trim()) body.append('ptr_number', form.ptr_number.trim())
    form.practice_areas.forEach((area) => body.append('practice_areas[]', area))
    body.append('region', form.region)
    if (form.city.trim()) body.append('city', form.city.trim())
    if (form.phone.trim()) body.append('phone', form.phone.trim())
    body.append('is_notary', form.is_notary ? '1' : '0')
    if (form.is_notary) {
      body.append('notarial_commission_number', form.notarial_commission_number.trim())
      body.append('notarial_commission_issuer', form.notarial_commission_issuer.trim())
      body.append('notarial_commission_expires_at', form.notarial_commission_expires_at)
    }
    body.append('max_concurrent_assignments', String(form.max_concurrent_assignments))
    if (idFile.value) body.append('id_document', idFile.value)
    if (barFile.value) body.append('bar_membership_document', barFile.value)

    await api('/lawyer/profile', { method: 'POST', body })

    await auth.fetchUser()

    // The verification pipeline re-runs from the top; the waiting screen is
    // the honest place to send an applicant once the form is submitted.
    toast.success('Application submitted — our team will review it.')
    await navigateTo('/lawyer/pending')
  } catch (err: any) {
    const parsed = parseApiError(err)
    error.value = parsed.message
    if (Object.keys(parsed.fields).length > 0) {
      fieldErrors.value = { ...fieldErrors.value, ...parsed.fields }
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="flex flex-1 flex-col bg-muted/30">
    <header class="flex items-center justify-between px-6 py-4 sm:px-10">
      <NuxtLink to="/" class="flex items-center gap-2.5 font-heading text-lg font-semibold tracking-tight">
        <span class="size-2.5 rounded-full bg-peach" />
        Batayan
      </NuxtLink>
      <NuxtLink to="/chat" class="text-sm text-muted-foreground hover:text-foreground">Back to workspace</NuxtLink>
    </header>

    <main class="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <div v-if="loadingProfile" class="space-y-4">
        <div class="h-24 rounded-xl border bg-card" />
        <div class="h-80 rounded-xl border bg-card" />
      </div>

      <template v-else>
        <div class="mb-8 text-center">
          <div class="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-forest text-cream">
            <ScaleIcon class="size-6" />
          </div>
          <h1 class="font-heading text-3xl font-semibold tracking-tight">Become a verified lawyer</h1>
          <p class="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
            {{
              existing?.verification_status === 'rejected'
                ? 'Your previous application was not approved. Update the details below and resubmit.'
                : 'Offer document vetting and notarization services to Batayan members. We review every application before matching you with work.'
            }}
          </p>
        </div>

        <div v-if="existing?.verification_status === 'rejected'" class="mb-6 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p class="font-medium text-destructive">Application not approved</p>
          <p v-if="existing.verification_reason" class="mt-1 text-muted-foreground">{{ existing.verification_reason }}</p>
        </div>

        <form class="space-y-6" @submit.prevent="handleSubmit">
          <section class="space-y-5 rounded-2xl border bg-card p-6">
            <div>
              <h2 class="font-heading text-base font-semibold">Professional details</h2>
              <p class="mt-0.5 text-xs text-muted-foreground">How your legal practice will be identified.</p>
            </div>

            <div class="space-y-1.5">
              <Label for="lawyer-full-name">Full legal name</Label>
              <Input id="lawyer-full-name" v-model="form.full_name" placeholder="e.g. Atty. Maria Santos" />
              <p v-if="fieldErrors.full_name" class="text-xs text-destructive">{{ fieldErrors.full_name }}</p>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div class="space-y-1.5">
                <Label for="bar-number">Roll number</Label>
                <Input id="bar-number" v-model="form.bar_number" placeholder="e.g. 12345" />
                <p v-if="fieldErrors.bar_number" class="text-xs text-destructive">{{ fieldErrors.bar_number }}</p>
              </div>
              <div class="space-y-1.5">
                <Label for="bar-jurisdiction">Bar admission</Label>
                <Input id="bar-jurisdiction" v-model="form.bar_jurisdiction" placeholder="e.g. Integrated Bar of the Philippines" />
                <p v-if="fieldErrors.bar_jurisdiction" class="text-xs text-destructive">{{ fieldErrors.bar_jurisdiction }}</p>
              </div>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div class="space-y-1.5">
                <Label for="ptr-number">PTR number (optional)</Label>
                <Input id="ptr-number" v-model="form.ptr_number" placeholder="Current year's proof of payment" />
              </div>
              <div class="space-y-1.5">
                <Label for="max-concurrent">Concurrent requests</Label>
                <Input id="max-concurrent" v-model.number="form.max_concurrent_assignments" type="number" min="1" />
              </div>
            </div>
          </section>

          <section class="space-y-5 rounded-2xl border bg-card p-6">
            <div>
              <h2 class="font-heading text-base font-semibold">Practice areas</h2>
              <p class="mt-0.5 text-xs text-muted-foreground">Choose the practice areas you handle. You'll be offered vetting requests for the matching document types.</p>
            </div>

            <div class="flex flex-wrap gap-2">
              <button
                v-for="option in options.practice_area_options"
                :key="option.value"
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                :class="form.practice_areas.includes(option.value) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'"
                @click="toggleArea(option.value)"
              >
                <BadgeCheckIcon v-if="form.practice_areas.includes(option.value)" class="size-3.5" />
                {{ option.label }}
              </button>
            </div>
            <p v-if="fieldErrors.practice_areas" class="text-xs text-destructive">{{ fieldErrors.practice_areas }}</p>

            <div v-if="form.practice_areas.length > 0" class="space-y-2 rounded-xl bg-muted/50 p-4">
              <p class="text-xs font-medium text-muted-foreground">Document types you'll be matched for:</p>
              <div v-for="area in form.practice_areas" :key="area" class="text-sm leading-snug">
                <span class="font-medium">{{ areaLabel(area) }}</span>
                <span v-if="documentsFor(area).length > 0" class="text-muted-foreground">
                  — {{ documentsFor(area).join(', ') }}
                </span>
                <span v-else class="text-muted-foreground">— any unclassified document type</span>
              </div>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div class="space-y-1.5">
                <Label for="lawyer-region">
                  <span class="inline-flex items-center gap-1"><MapPinIcon class="size-3.5" /> Primary region</span>
                </Label>
                <Select v-model="form.region">
                  <SelectTrigger id="lawyer-region" class="w-full">
                    <SelectValue :placeholder="'Select a region'" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="r in options.region_options" :key="r.value" :value="r.value">
                      {{ r.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p v-if="fieldErrors.region" class="text-xs text-destructive">{{ fieldErrors.region }}</p>
              </div>
              <div class="space-y-1.5">
                <Label for="lawyer-city">City (optional)</Label>
                <Input id="lawyer-city" v-model="form.city" placeholder="e.g. Makati" />
              </div>
            </div>

            <div class="space-y-1.5">
              <Label for="lawyer-phone">Mobile number (optional)</Label>
              <Input id="lawyer-phone" v-model="form.phone" placeholder="+63 912 345 6789" />
            </div>
          </section>

          <section class="space-y-5 rounded-2xl border bg-card p-6">
            <div class="flex items-center justify-between gap-4">
              <div>
                <h2 class="font-heading text-base font-semibold">Notary commission</h2>
                <p class="mt-0.5 text-xs text-muted-foreground">Enabled lawyers can perform remote notarizations. A current commission is required.</p>
              </div>
              <Switch id="is-notary" v-model:checked="form.is_notary" />
            </div>

            <template v-if="form.is_notary">
              <div class="grid gap-4 sm:grid-cols-2">
                <div class="space-y-1.5">
                  <Label for="commission-number">Commission number</Label>
                  <Input id="commission-number" v-model="form.notarial_commission_number" placeholder="e.g. NC-2026-00123" />
                  <p v-if="fieldErrors.notarial_commission_number" class="text-xs text-destructive">{{ fieldErrors.notarial_commission_number }}</p>
                </div>
                <div class="space-y-1.5">
                  <Label for="commission-issuer">Commissioned by</Label>
                  <Input id="commission-issuer" v-model="form.notarial_commission_issuer" placeholder="e.g. Executive Judge, RTC Makati" />
                  <p v-if="fieldErrors.notarial_commission_issuer" class="text-xs text-destructive">{{ fieldErrors.notarial_commission_issuer }}</p>
                </div>
              </div>
              <div class="space-y-1.5">
                <Label for="commission-expiry">Commission expiry</Label>
                <Input id="commission-expiry" v-model="form.notarial_commission_expires_at" type="date" />
                <p v-if="fieldErrors.notarial_commission_expires_at" class="text-xs text-destructive">{{ fieldErrors.notarial_commission_expires_at }}</p>
              </div>
            </template>
          </section>

          <section class="space-y-5 rounded-2xl border bg-card p-6">
            <div>
              <h2 class="font-heading text-base font-semibold">Credential documents</h2>
              <p class="mt-0.5 text-xs text-muted-foreground">PDF, JPG, PNG, or WebP up to 10 MB. Encrypted at rest and only reviewed by our team.</p>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div class="space-y-1.5">
                <Label for="id-doc">Government-issued ID</Label>
                <button
                  type="button"
                  class="flex w-full items-center gap-3 rounded-lg border border-dashed p-3 text-left text-xs transition-colors hover:border-primary/50"
                  @click="idInput?.click()"
                >
                  <FileUpIcon class="size-4 shrink-0 text-muted-foreground" />
                  <span class="min-w-0 truncate">{{ fileLabel(idFile, existing?.has_id_document ?? false) }}</span>
                </button>
                <input ref="idInput" type="file" accept=".pdf,image/jpeg,image/png,image/webp" class="hidden" @change="onPickId">
                <p v-if="fieldErrors.id_document" class="text-xs text-destructive">{{ fieldErrors.id_document }}</p>
              </div>

              <div class="space-y-1.5">
                <Label for="bar-doc">Bar membership certificate</Label>
                <button
                  type="button"
                  class="flex w-full items-center gap-3 rounded-lg border border-dashed p-3 text-left text-xs transition-colors hover:border-primary/50"
                  @click="barInput?.click()"
                >
                  <FileUpIcon class="size-4 shrink-0 text-muted-foreground" />
                  <span class="min-w-0 truncate">{{ fileLabel(barFile, existing?.has_bar_membership_document ?? false) }}</span>
                </button>
                <input ref="barInput" type="file" accept=".pdf,image/jpeg,image/png,image/webp" class="hidden" @change="onPickBar">
                <p v-if="fieldErrors.bar_membership_document" class="text-xs text-destructive">{{ fieldErrors.bar_membership_document }}</p>
              </div>
            </div>
          </section>

          <div v-if="error" class="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {{ error }}
          </div>

          <Button type="submit" size="lg" class="w-full" :disabled="submitting || loading">
            <Loader2Icon v-if="submitting" class="size-4 animate-spin" />
            {{ existing ? 'Resubmit application' : 'Submit application' }}
          </Button>
        </form>
      </template>
    </main>
  </div>
</template>
