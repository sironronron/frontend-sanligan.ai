<script setup lang="ts">
import type { Component } from 'vue'
import {
  BookOpenIcon,
  BriefcaseIcon,
  BuildingIcon,
  FileSignatureIcon,
  FileTextIcon,
  GavelIcon,
  GraduationCapIcon,
  HandshakeIcon,
  HomeIcon,
  KeyIcon,
  LandmarkIcon,
  LayersIcon,
  Loader2Icon,
  MailIcon,
  MapIcon,
  PencilIcon,
  ScaleIcon,
  ScrollTextIcon,
  SearchIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  SproutIcon,
  StampIcon,
  StoreIcon,
  TrashIcon,
  TractorIcon,
  UserRoundIcon,
} from '@lucide/vue'
import type { OnboardingChoice } from '~/components/OnboardingOptions.vue'
import { toast } from '~/components/ui/sonner'
import {
  KYC_MAX_ROLES,
  KYC_MAX_USE_CASES,
  KYC_ROLE_OTHER,
  KYC_USE_CASE_OTHER,
  kycDocumentTypesLabel,
  kycDocumentTypeOptions,
  kycExperienceLevelLabel,
  kycExperienceLevelOptions,
  kycKeys,
  kycRolesLabel,
  kycRoleOptions,
  kycUseCasesLabel,
  kycUseCaseOptions,
} from '~/utils/kyc'

definePageMeta({
  middleware: ['auth', 'organization'],
  layout: 'default',
})

const auth = useAuthStore()

const roles = ref<string[]>(kycKeys(auth.user?.kyc_role))
const roleOther = ref(auth.user?.kyc_role_other ?? '')
const useCases = ref<string[]>(kycKeys(auth.user?.kyc_use_case))
const useCaseOther = ref(auth.user?.kyc_use_case_other ?? '')
const documentTypes = ref<string[]>(kycKeys(auth.user?.kyc_document_types))
const experienceLevel = ref<string | null>(auth.user?.kyc_experience_level ?? null)
const confirmingClear = ref(false)
const saving = ref(false)
const clearing = ref(false)

/** Icons are presentation, so they live here rather than in the shared KYC options. */
const roleIcons: Record<string, Component> = {
  private_individual: UserRoundIcon,
  lawyer: ScaleIcon,
  paralegal: FileTextIcon,
  government_employee: LandmarkIcon,
  real_estate_broker: HomeIcon,
  farmer: TractorIcon,
  business_owner: StoreIcon,
  law_student: GraduationCapIcon,
  notary_public: StampIcon,
  [KYC_ROLE_OTHER]: SparklesIcon,
}

const useCaseIcons: Record<string, Component> = {
  personal_dispute: GavelIcon,
  own_transaction: PencilIcon,
  client_work: BriefcaseIcon,
  legal_research: SearchIcon,
  government_transaction: BuildingIcon,
  agrarian_land: MapIcon,
  learning: BookOpenIcon,
  [KYC_USE_CASE_OTHER]: SparklesIcon,
}

const documentIcons: Record<string, Component> = {
  demand_letter: MailIcon,
  contract: HandshakeIcon,
  deed: FileSignatureIcon,
  affidavit: ShieldCheckIcon,
  government_letter: LandmarkIcon,
  complaint: GavelIcon,
  power_of_attorney: ScrollTextIcon,
  lease: KeyIcon,
  other_doc: LayersIcon,
}

function withIcons(options: KycOption[], icons: Record<string, Component>): OnboardingChoice[] {
  return options.map(option => ({ ...option, icon: icons[option.value] ?? LayersIcon }))
}

const roleChoices = withIcons(kycRoleOptions, roleIcons)
const useCaseChoices = withIcons(kycUseCaseOptions, useCaseIcons)
const documentChoices = withIcons(kycDocumentTypeOptions, documentIcons)

const experienceIcons: Record<string, Component> = {
  beginner: SproutIcon,
  intermediate: BookOpenIcon,
  experienced: BriefcaseIcon,
  professional: ScaleIcon,
}

/** The em dash in each experience label separates the level from its meaning. */
const experienceChoices: OnboardingChoice[] = kycExperienceLevelOptions.map((option) => {
  const [level, meaning] = option.label.split('—')

  return {
    value: option.value,
    label: (level ?? option.label).trim(),
    hint: meaning?.trim(),
    icon: experienceIcons[option.value] ?? LayersIcon,
  }
})

const rolesHasOther = computed(() => roles.value.includes(KYC_ROLE_OTHER))
const useCasesHasOther = computed(() => useCases.value.includes(KYC_USE_CASE_OTHER))

const dirty = computed(() => {
  const current = auth.user
  if (!current) return false
  const same = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b)
  return !same(roles.value, kycKeys(current.kyc_role))
    || roleOther.value !== (current.kyc_role_other ?? '')
    || !same(useCases.value, kycKeys(current.kyc_use_case))
    || useCaseOther.value !== (current.kyc_use_case_other ?? '')
    || !same(documentTypes.value, kycKeys(current.kyc_document_types))
    || experienceLevel.value !== (current.kyc_experience_level ?? null)
})

// Dropping "Other" makes the free-text answer dead weight; keeping it would
// send a stale description alongside the remaining choices.
watch(rolesHasOther, (hasOther) => {
  if (!hasOther) roleOther.value = ''
})

watch(useCasesHasOther, (hasOther) => {
  if (!hasOther) useCaseOther.value = ''
})

function formatDate(value: string | null) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

async function handleSave() {
  if (saving.value) return
  if (roles.value.length === 0 || useCases.value.length === 0) return
  saving.value = true
  try {
    await auth.saveKyc({
      kyc_role: roles.value,
      ...(rolesHasOther.value ? { kyc_role_other: roleOther.value.trim() } : {}),
      kyc_use_case: useCases.value,
      ...(useCasesHasOther.value ? { kyc_use_case_other: useCaseOther.value.trim() } : {}),
      kyc_document_types: documentTypes.value,
      kyc_experience_level: experienceLevel.value,
    })
    toast.success('Your personalization was saved')
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not save your personalization')
  } finally {
    saving.value = false
  }
}

async function handleClear() {
  if (clearing.value) return

  if (confirmingClear.value) {
    confirmingClear.value = false
    clearing.value = true
    try {
      await auth.clearKyc()
      roles.value = []
      roleOther.value = ''
      useCases.value = []
      useCaseOther.value = ''
      documentTypes.value = []
      experienceLevel.value = null
      toast.success('Your personalization was cleared')
    } catch (err: any) {
      toast.error(err?.data?.message ?? 'Could not clear your personalization')
    } finally {
      clearing.value = false
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
    <PageHeader
      title="Personalization"
      description="Tell Batayan who you are and what you'll use it for so it can match its tone and drafting style. These answers are self-reported — they only calibrate responses and never grant access."
    />

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
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Roles</p>
              <p class="mt-1 text-sm font-medium">{{ kycRolesLabel(auth.user?.kyc_role) }}</p>
              <p v-if="kycKeys(auth.user?.kyc_role).includes(KYC_ROLE_OTHER) && auth.user?.kyc_role_other" class="mt-0.5 text-xs text-muted-foreground">
                {{ auth.user.kyc_role_other }}
              </p>
            </div>
            <div class="rounded-lg border bg-muted/30 p-3">
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Primary uses</p>
              <p class="mt-1 text-sm font-medium">{{ kycUseCasesLabel(auth.user?.kyc_use_case) }}</p>
              <p v-if="kycKeys(auth.user?.kyc_use_case).includes(KYC_USE_CASE_OTHER) && auth.user?.kyc_use_case_other" class="mt-0.5 text-xs text-muted-foreground">
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
        <div v-else class="rounded-lg border border-dashed bg-muted/45 p-4 text-sm text-muted-foreground">
          You haven't set up a profile yet. Complete onboarding to personalize Batayan's responses.
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Edit your profile</CardTitle>
        <CardDescription>Update your answers at any time.</CardDescription>
      </CardHeader>
      <CardContent class="space-y-8">
        <div>
          <p class="mb-3 text-sm font-medium">
            What best describes you?
            <span class="font-normal text-muted-foreground">(up to {{ KYC_MAX_ROLES }})</span>
          </p>
          <OnboardingOptions v-model="roles" name="kyc-role-settings" :options="roleChoices" multiple :max="KYC_MAX_ROLES" />
          <p class="mt-3 text-xs text-muted-foreground">
            {{ roles.length }} of {{ KYC_MAX_ROLES }} selected
          </p>
          <div v-if="rolesHasOther" class="mt-3">
            <Label for="kyc_role_other_settings" class="text-xs font-medium text-muted-foreground">
              Tell us about your role
            </Label>
            <Input id="kyc_role_other_settings" v-model="roleOther" maxlength="255" placeholder="e.g. Community organizer at a farmers cooperative" class="mt-1.5 h-10" />
          </div>
        </div>

        <div>
          <p class="mb-3 text-sm font-medium">
            What will you mainly use Batayan for?
            <span class="font-normal text-muted-foreground">(up to {{ KYC_MAX_USE_CASES }})</span>
          </p>
          <OnboardingOptions v-model="useCases" name="kyc-use-case-settings" :options="useCaseChoices" multiple :max="KYC_MAX_USE_CASES" />
          <p class="mt-3 text-xs text-muted-foreground">
            {{ useCases.length }} of {{ KYC_MAX_USE_CASES }} selected
          </p>
          <div v-if="useCasesHasOther" class="mt-3">
            <Label for="kyc_use_case_other_settings" class="text-xs font-medium text-muted-foreground">
              Tell us about your primary use
            </Label>
            <Input id="kyc_use_case_other_settings" v-model="useCaseOther" maxlength="255" placeholder="e.g. Helping my barangay with titling paperwork" class="mt-1.5 h-10" />
          </div>
        </div>

        <div>
          <p class="mb-3 text-sm font-medium">
            Which documents do you work with?
            <span class="font-normal text-muted-foreground">(select all that apply)</span>
          </p>
          <OnboardingOptions v-model="documentTypes" name="kyc-document-types-settings" :options="documentChoices" multiple dense />
          <p class="mt-3 text-xs text-muted-foreground">
            {{ documentTypes.length }} selected
          </p>
        </div>

        <div>
          <p class="mb-3 text-sm font-medium">How familiar are you with legal documents?</p>
          <OnboardingOptions v-model="experienceLevel" name="kyc-experience-settings" :options="experienceChoices" />
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <Button
            v-if="auth.kycCompleted"
            variant="ghost"
            :class="confirmingClear ? 'text-destructive' : 'text-muted-foreground hover:text-destructive'"
            :disabled="saving || clearing"
            @click="handleClear"
          >
            <Loader2Icon v-if="clearing" class="size-4 animate-spin" />
            <TrashIcon v-else class="size-4" />
            {{ confirmingClear ? 'Confirm clear' : 'Clear profile' }}
          </Button>
          <span v-else />
          <Button :disabled="!dirty || roles.length === 0 || useCases.length === 0 || saving || clearing" :loading="saving" @click="handleSave">
            {{ saving ? 'Saving…' : 'Save changes' }}
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
