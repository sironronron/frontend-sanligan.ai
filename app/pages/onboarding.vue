<script setup lang="ts">
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, UserIcon, FileTextIcon, SparklesIcon } from '@lucide/vue'
import { KYC_ROLE_OTHER, KYC_USE_CASE_OTHER, kycRoleOptions, kycUseCaseOptions, kycDocumentTypeOptions, kycExperienceLevelOptions } from '~/utils/kyc'

definePageMeta({
  middleware: 'auth',
  layout: 'bare',
})

const auth = useAuthStore()

if (auth.kycCompleted) {
  await navigateTo(auth.homePath())
}

const step = ref(1)
const role = ref<string | null>(null)
const roleOther = ref('')
const useCase = ref<string | null>(null)
const useCaseOther = ref('')
const documentTypes = ref<string[]>([])
const experienceLevel = ref<string | null>(null)
const error = ref('')
const submitting = ref(false)
const nextUrl = useRoute().query.next

function destination() {
  return typeof nextUrl === 'string' && nextUrl.length > 0 ? nextUrl : auth.homePath()
}

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

function canContinue() {
  if (step.value === 1) {
    return role.value !== null && (role.value !== KYC_ROLE_OTHER || roleOther.value.trim() !== '')
  }
  if (step.value === 2) {
    return useCase.value !== null && (useCase.value !== KYC_USE_CASE_OTHER || useCaseOther.value.trim() !== '')
  }
  return documentTypes.value.length > 0 && experienceLevel.value !== null
}

function next() {
  if (!canContinue()) return
  step.value++
}

function back() {
  step.value--
}

async function handleSubmit() {
  if (submitting.value || !canContinue()) return

  error.value = ''
  submitting.value = true

  try {
    await auth.saveKyc({
      kyc_role: role.value!,
      ...(role.value === KYC_ROLE_OTHER ? { kyc_role_other: roleOther.value.trim() } : {}),
      kyc_use_case: useCase.value!,
      ...(useCase.value === KYC_USE_CASE_OTHER ? { kyc_use_case_other: useCaseOther.value.trim() } : {}),
      kyc_document_types: documentTypes.value,
      kyc_experience_level: experienceLevel.value!,
    })
    const dest = destination()
    await navigateTo(`/preparing?next=${encodeURIComponent(dest)}`)
  } catch (err: any) {
    error.value = err?.data?.message ?? 'Could not save your profile. Please try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="flex flex-1 items-center justify-center px-4 py-12">
    <Card class="w-full max-w-xl">
      <CardHeader class="text-center">
        <div class="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10">
          <component :is="step === 1 ? UserIcon : step === 2 ? FileTextIcon : SparklesIcon" class="size-6 text-primary" />
        </div>
        <CardTitle class="text-2xl">Welcome to Batayan</CardTitle>
        <CardDescription class="text-base">
          Help us personalize your experience. These details allow Batayan to match its tone, depth, and drafting style to your needs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="mb-6">
          <div class="flex items-center justify-between text-sm font-medium text-muted-foreground mb-2">
            <span>Step {{ step }} of 3</span>
            <span>{{ step === 1 ? 'Your Role' : step === 2 ? 'Your Use Case' : 'Document Types & Experience' }}</span>
          </div>
          <div class="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              class="h-full rounded-full bg-primary transition-all duration-300 ease-in-out"
              :style="{ width: step === 1 ? '33%' : step === 2 ? '66%' : '100%' }"
            />
          </div>
        </div>

        <template v-if="step === 1">
          <h3 class="text-lg font-semibold mb-1">What best describes you?</h3>
          <p class="text-sm text-muted-foreground mb-4">Select the option that most closely matches your profession or role.</p>

          <div class="grid gap-2">
            <button
              v-for="option in kycRoleOptions"
              :key="option.value"
              type="button"
              class="group flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all duration-200 hover:border-primary/50 hover:bg-primary/5"
              :class="role === option.value ? 'border-primary bg-primary/5 shadow-sm' : 'border-border'"
              @click="selectRole(option)"
            >
              <div
                class="flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
                :class="role === option.value ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30 group-hover:border-primary/50'"
              >
                <CheckIcon v-if="role === option.value" class="size-3" />
              </div>
              <span class="text-sm font-medium">{{ option.label }}</span>
            </button>
          </div>

          <div v-if="role === KYC_ROLE_OTHER" class="mt-4 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-4">
            <Label for="kyc_role_other" class="text-sm font-medium">Tell us about your role</Label>
            <Input
              id="kyc_role_other"
              v-model="roleOther"
              maxlength="255"
              placeholder="e.g. Community organizer at a farmers cooperative"
              class="mt-2"
            />
          </div>

          <div class="mt-8 flex justify-end">
            <Button type="button" size="lg" :disabled="!canContinue()" @click="next">
              Continue
              <ArrowRightIcon class="ml-2 size-4" />
            </Button>
          </div>
        </template>

        <template v-else-if="step === 2">
          <h3 class="text-lg font-semibold mb-1">What will you primarily use Batayan for?</h3>
          <p class="text-sm text-muted-foreground mb-4">Select your main use case so we can tailor responses appropriately.</p>

          <div class="grid gap-2">
            <button
              v-for="option in kycUseCaseOptions"
              :key="option.value"
              type="button"
              class="group flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all duration-200 hover:border-primary/50 hover:bg-primary/5"
              :class="useCase === option.value ? 'border-primary bg-primary/5 shadow-sm' : 'border-border'"
              @click="selectUseCase(option)"
            >
              <div
                class="flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
                :class="useCase === option.value ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30 group-hover:border-primary/50'"
              >
                <CheckIcon v-if="useCase === option.value" class="size-3" />
              </div>
              <span class="text-sm font-medium">{{ option.label }}</span>
            </button>
          </div>

          <div v-if="useCase === KYC_USE_CASE_OTHER" class="mt-4 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-4">
            <Label for="kyc_use_case_other" class="text-sm font-medium">Tell us about your primary use</Label>
            <Input
              id="kyc_use_case_other"
              v-model="useCaseOther"
              maxlength="255"
              placeholder="e.g. Helping my barangay with titling paperwork"
              class="mt-2"
            />
          </div>

          <div class="mt-8 flex items-center justify-between">
            <Button type="button" variant="outline" size="lg" @click="back">
              <ArrowLeftIcon class="mr-2 size-4" />
              Back
            </Button>
            <Button type="button" size="lg" :disabled="!canContinue()" @click="next">
              Continue
              <ArrowRightIcon class="ml-2 size-4" />
            </Button>
          </div>
        </template>

        <template v-else>
          <h3 class="text-lg font-semibold mb-1">What types of documents do you work with?</h3>
          <p class="text-sm text-muted-foreground mb-2">Select all that apply. This helps Batayan anticipate document-specific requirements.</p>

          <div class="grid gap-2">
            <button
              v-for="option in kycDocumentTypeOptions"
              :key="option.value"
              type="button"
              class="group flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all duration-200 hover:border-primary/50 hover:bg-primary/5"
              :class="documentTypes.includes(option.value) ? 'border-primary bg-primary/5 shadow-sm' : 'border-border'"
              @click="toggleDocumentType(option.value)"
            >
              <div
                class="flex size-5 shrink-0 items-center justify-center rounded border-2 transition-colors"
                :class="documentTypes.includes(option.value) ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30 group-hover:border-primary/50'"
              >
                <CheckIcon v-if="documentTypes.includes(option.value)" class="size-3" />
              </div>
              <span class="text-sm font-medium">{{ option.label }}</span>
            </button>
          </div>

          <h3 class="text-lg font-semibold mt-6 mb-1">How experienced are you with legal documents?</h3>
          <p class="text-sm text-muted-foreground mb-4">This calibrates how much step-by-step guidance Batayan provides.</p>

          <div class="grid gap-2">
            <button
              v-for="option in kycExperienceLevelOptions"
              :key="option.value"
              type="button"
              class="group flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all duration-200 hover:border-primary/50 hover:bg-primary/5"
              :class="experienceLevel === option.value ? 'border-primary bg-primary/5 shadow-sm' : 'border-border'"
              @click="selectExperienceLevel(option.value)"
            >
              <div
                class="flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
                :class="experienceLevel === option.value ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30 group-hover:border-primary/50'"
              >
                <CheckIcon v-if="experienceLevel === option.value" class="size-3" />
              </div>
              <span class="text-sm font-medium">{{ option.label }}</span>
            </button>
          </div>

          <p v-if="error" class="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive border border-destructive/20">
            {{ error }}
          </p>

          <div class="mt-8 flex items-center justify-between">
            <Button type="button" variant="outline" size="lg" @click="back">
              <ArrowLeftIcon class="mr-2 size-4" />
              Back
            </Button>
            <Button type="button" size="lg" :disabled="submitting || !canContinue()" :loading="submitting" @click="handleSubmit">
              {{ submitting ? 'Setting up…' : 'Get Started' }}
            </Button>
          </div>
        </template>
      </CardContent>
      <CardFooter class="justify-center text-xs text-muted-foreground">
        Your responses are private and help calibrate Batayan's responses. You can update these anytime in Settings.
      </CardFooter>
    </Card>
  </div>
</template>
