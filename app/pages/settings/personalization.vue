<script setup lang="ts">
import { CheckIcon, Loader2Icon, SlidersHorizontalIcon, TrashIcon } from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import { KYC_ROLE_OTHER, KYC_USE_CASE_OTHER, kycDocumentTypeLabel, kycDocumentTypesLabel, kycDocumentTypeOptions, kycExperienceLevelLabel, kycExperienceLevelOptions, kycRoleLabel, kycRoleOptions, kycUseCaseLabel, kycUseCaseOptions, type KycOption } from '~/utils/kyc'

definePageMeta({
  middleware: ['auth', 'organization'],
  layout: 'default',
})

const auth = useAuthStore()

const role = ref<string | null>(auth.user?.kyc_role ?? null)
const roleOther = ref(auth.user?.kyc_role_other ?? '')
const useCase = ref<string | null>(auth.user?.kyc_use_case ?? null)
const useCaseOther = ref(auth.user?.kyc_use_case_other ?? '')
const documentTypes = ref<string[]>((auth.user?.kyc_document_types ?? '').split(',').filter(Boolean))
const experienceLevel = ref<string | null>(auth.user?.kyc_experience_level ?? null)
const confirmingClear = ref(false)

const dirty = computed(() => {
  const current = auth.user
  if (!current) return false
  const currentDocTypes = (current.kyc_document_types ?? '').split(',').filter(Boolean)
  return role.value !== (current.kyc_role ?? null)
    || roleOther.value !== (current.kyc_role_other ?? '')
    || useCase.value !== (current.kyc_use_case ?? null)
    || useCaseOther.value !== (current.kyc_use_case_other ?? '')
    || JSON.stringify(documentTypes.value) !== JSON.stringify(currentDocTypes)
    || experienceLevel.value !== (current.kyc_experience_level ?? null)
})

function selectRole(option: KycOption) {
  role.value = option.value
  if (option.value !== KYC_ROLE_OTHER) roleOther.value = ''
}

function selectUseCase(option: KycOption) {
  useCase.value = option.value
  if (option.value !== KYC_USE_CASE_OTHER) useCaseOther.value = ''
}

function toggleDocumentType(value: string) {
  const idx = documentTypes.value.indexOf(value)
  if (idx === -1) {
    documentTypes.value.push(value)
  } else {
    documentTypes.value.splice(idx, 1)
  }
}

function selectExperienceLevel(value: string) {
  experienceLevel.value = value
}

function formatDate(value: string | null) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

async function handleSave() {
  if (!role.value || !useCase.value) return
  try {
    await auth.saveKyc({
      kyc_role: role.value,
      ...(role.value === KYC_ROLE_OTHER ? { kyc_role_other: roleOther.value.trim() } : {}),
      kyc_use_case: useCase.value,
      ...(useCase.value === KYC_USE_CASE_OTHER ? { kyc_use_case_other: useCaseOther.value.trim() } : {}),
      kyc_document_types: documentTypes.value,
      kyc_experience_level: experienceLevel.value,
    })
    toast.success('Your personalization was saved')
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not save your personalization')
  }
}

async function handleClear() {
  if (confirmingClear.value) {
    confirmingClear.value = false
    try {
      await auth.clearKyc()
      role.value = null
      roleOther.value = ''
      useCase.value = null
      useCaseOther.value = ''
      documentTypes.value = []
      experienceLevel.value = null
      toast.success('Your personalization was cleared')
    } catch (err: any) {
      toast.error(err?.data?.message ?? 'Could not clear your personalization')
    }
    return
  }
  confirmingClear.value = true
  setTimeout(() => {
    confirmingClear.value = false
  }, 4000)
}
</script>

<template>
  <div class="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
    <div class="mb-8">
      <h1 class="text-2xl font-bold tracking-tight">Personalization</h1>
      <p class="mt-1 text-sm text-muted-foreground">
        Tell Batayan who you are and what you'll use it for so it can match its tone and drafting style. These answers are self-reported — they only calibrate responses and never grant access.
      </p>
    </div>

    <Card class="mb-6">
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <SlidersHorizontalIcon class="size-4 text-muted-foreground" />
          Current profile
        </CardTitle>
        <CardDescription>
          Used on every message to calibrate the AI's tone, depth, and drafting defaults.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <template v-if="auth.kycCompleted">
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="rounded-lg border bg-muted/30 p-3">
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Role</p>
              <p class="mt-1 text-sm font-medium">{{ kycRoleLabel(auth.user?.kyc_role) }}</p>
              <p v-if="auth.user?.kyc_role === KYC_ROLE_OTHER && auth.user?.kyc_role_other" class="mt-0.5 text-xs text-muted-foreground">
                {{ auth.user.kyc_role_other }}
              </p>
            </div>
            <div class="rounded-lg border bg-muted/30 p-3">
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Primary use</p>
              <p class="mt-1 text-sm font-medium">{{ kycUseCaseLabel(auth.user?.kyc_use_case) }}</p>
              <p v-if="auth.user?.kyc_use_case === KYC_USE_CASE_OTHER && auth.user?.kyc_use_case_other" class="mt-0.5 text-xs text-muted-foreground">
                {{ auth.user.kyc_use_case_other }}
              </p>
            </div>
            <div class="rounded-lg border bg-muted/30 p-3">
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Document types</p>
              <p class="mt-1 text-sm font-medium">{{ kycDocumentTypesLabel(auth.user?.kyc_document_types) }}</p>
            </div>
            <div class="rounded-lg border bg-muted/30 p-3">
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Experience level</p>
              <p class="mt-1 text-sm font-medium">{{ kycExperienceLevelLabel(auth.user?.kyc_experience_level) }}</p>
            </div>
          </div>
          <p v-if="formatDate(auth.user?.kyc_completed_at)" class="mt-3 text-xs text-muted-foreground">
            Completed {{ formatDate(auth.user?.kyc_completed_at) }}
          </p>
        </template>
        <div v-else class="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          You haven't set up a profile yet. Complete onboarding to personalize Batayan's responses.
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Edit your profile</CardTitle>
        <CardDescription>Update your answers at any time.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <div>
          <p class="mb-3 text-sm font-medium">What best describes you?</p>
          <div class="grid gap-2 sm:grid-cols-2">
            <button
              v-for="option in kycRoleOptions"
              :key="option.value"
              type="button"
              class="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted"
              :class="role === option.value ? 'border-primary bg-primary/5' : 'border-input'"
              @click="selectRole(option)"
            >
              <span>{{ option.label }}</span>
              <CheckIcon v-if="role === option.value" class="size-4 shrink-0 text-primary" />
            </button>
          </div>
          <div v-if="role === KYC_ROLE_OTHER" class="mt-3 space-y-2">
            <Label for="kyc_role_other_settings">Describe your role</Label>
            <Input id="kyc_role_other_settings" v-model="roleOther" maxlength="255" placeholder="e.g. Community organizer at a farmers cooperative" />
          </div>
        </div>

        <div>
          <p class="mb-3 text-sm font-medium">What will you primarily use Batayan for?</p>
          <div class="grid gap-2 sm:grid-cols-2">
            <button
              v-for="option in kycUseCaseOptions"
              :key="option.value"
              type="button"
              class="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted"
              :class="useCase === option.value ? 'border-primary bg-primary/5' : 'border-input'"
              @click="selectUseCase(option)"
            >
              <span>{{ option.label }}</span>
              <CheckIcon v-if="useCase === option.value" class="size-4 shrink-0 text-primary" />
            </button>
          </div>
          <div v-if="useCase === KYC_USE_CASE_OTHER" class="mt-3 space-y-2">
            <Label for="kyc_use_case_other_settings">Describe your primary use</Label>
            <Input id="kyc_use_case_other_settings" v-model="useCaseOther" maxlength="255" placeholder="e.g. Helping my barangay with titling paperwork" />
          </div>
        </div>

        <div>
          <p class="mb-3 text-sm font-medium">What types of documents do you work with? <span class="text-muted-foreground font-normal">(select all that apply)</span></p>
          <div class="grid gap-2 sm:grid-cols-2">
            <button
              v-for="option in kycDocumentTypeOptions"
              :key="option.value"
              type="button"
              class="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted"
              :class="documentTypes.includes(option.value) ? 'border-primary bg-primary/5' : 'border-input'"
              @click="toggleDocumentType(option.value)"
            >
              <span>{{ option.label }}</span>
              <CheckIcon v-if="documentTypes.includes(option.value)" class="size-4 shrink-0 text-primary" />
            </button>
          </div>
        </div>

        <div>
          <p class="mb-3 text-sm font-medium">How experienced are you with legal documents?</p>
          <div class="grid gap-2 sm:grid-cols-2">
            <button
              v-for="option in kycExperienceLevelOptions"
              :key="option.value"
              type="button"
              class="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted"
              :class="experienceLevel === option.value ? 'border-primary bg-primary/5' : 'border-input'"
              @click="selectExperienceLevel(option.value)"
            >
              <span>{{ option.label }}</span>
              <CheckIcon v-if="experienceLevel === option.value" class="size-4 shrink-0 text-primary" />
            </button>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <Button
            v-if="auth.kycCompleted"
            variant="ghost"
            :class="confirmingClear ? 'text-destructive' : 'text-muted-foreground hover:text-destructive'"
            :disabled="auth.busy"
            @click="handleClear"
          >
            <Loader2Icon v-if="auth.busy" class="size-4 animate-spin" />
            <TrashIcon v-else class="size-4" />
            {{ confirmingClear ? 'Confirm clear' : 'Clear profile' }}
          </Button>
          <span v-else />
          <Button :disabled="!dirty || auth.busy || !role || !useCase" @click="handleSave">
            <Loader2Icon v-if="auth.busy" class="size-4 animate-spin" />
            {{ auth.busy ? 'Saving…' : 'Save changes' }}
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
