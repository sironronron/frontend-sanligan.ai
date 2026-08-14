<script setup lang="ts">
import { CheckIcon, CircleAlertIcon, MoonIcon, SunIcon } from '@lucide/vue'

definePageMeta({
  middleware: 'auth',
  layout: 'bare',
})

const auth = useAuthStore()

if (auth.hasOrganization) {
  await navigateTo(auth.homePath())
}

const { isDark, toggle: toggleTheme } = useTheme()

/**
 * The rail's stepper. Setting up the organization is the first of the three
 * things standing between signing up and working, so showing all three keeps
 * this screen from reading as an open-ended amount of setup.
 */
const steps = [
  { label: 'Your organization', hint: 'Name the workspace your matters live in.' },
  { label: 'A few questions', hint: 'So answers match the work you do.' },
  { label: 'Start working', hint: 'Research, draft, and track your cases.' },
]

const name = ref('')
const error = ref('')
const fieldErrors = ref<Record<string, string>>({})
const submitting = ref(false)

/** Stands in for the workspace avatar colleagues will see once they're invited. */
const initials = computed(() =>
  name.value
    .trim()
    .split(/\s+/)
    .filter(part => /[a-z0-9]/i.test(part))
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase(),
)

// The form is novalidate so the empty case renders in the page rather than in a
// native bubble, matching the sign-in screens.
function validate(): boolean {
  const errors: Record<string, string> = {}

  if (name.value.trim() === '') errors.name = 'Enter a name for your organization.'

  fieldErrors.value = errors

  return Object.keys(errors).length === 0
}

async function handleSubmit() {
  if (submitting.value) return

  error.value = ''
  fieldErrors.value = {}

  if (!validate()) return

  submitting.value = true

  try {
    await auth.createOrganization(name.value.trim())
    const billing = useBillingStore()
    const sub = await billing.fetchSubscription()
    const next = auth.user?.is_admin || sub?.status === 'active' ? '/chat' : '/pricing'
    await navigateTo(auth.kycCompleted ? next : `/onboarding?next=${encodeURIComponent(next)}`)
  } catch (err) {
    const parsed = parseApiError(err, 'Could not create your organization. Please try again.')
    error.value = parsed.message
    fieldErrors.value = parsed.fields
  } finally {
    submitting.value = false
  }
}

async function handleLogout() {
  await auth.logout()
  await navigateTo('/login')
}
</script>

<template>
  <div class="flex h-dvh flex-col overflow-hidden lg:flex-row">
    <!--
      This element is pinned to the viewport, matching onboarding: the rail and
      the Create button stay on screen and the form column takes any overflow on
      its own. The note lives inside the root rather than above it — a comment
      beside the root element counts as a second root node, which costs the page
      its transitions (NUXT_E4004).
    -->
    <!--
      The same forest rail as sign-in and onboarding, so the three screens of
      the join flow read as one continuous room rather than three detours.
    -->
    <aside class="relative hidden overflow-hidden bg-forest px-12 py-14 text-cream lg:flex lg:w-[38%] lg:max-w-md lg:shrink-0 lg:flex-col xl:px-14">
      <div aria-hidden="true" class="pointer-events-none absolute -right-28 -top-28 size-80 rounded-full bg-peach/10 blur-3xl" />
      <div aria-hidden="true" class="pointer-events-none absolute -bottom-32 -left-24 size-96 rounded-full bg-peach/[0.07] blur-3xl" />

      <div class="relative flex w-fit items-center gap-2.5 font-heading text-lg font-semibold tracking-tight">
        <span class="size-2.5 rounded-full bg-peach" />
        Batayan
      </div>

      <div class="relative my-auto min-h-0 overflow-y-auto py-10">
        <h2 class="font-heading text-3xl leading-[1.2] tracking-tight xl:text-4xl">
          One workspace for the whole practice.
        </h2>
        <p class="mt-3 text-sm leading-relaxed text-cream/70">
          Your organization holds your cases, documents, and templates, and it's what
          colleagues join when you invite them.
        </p>

        <ol class="mt-10 space-y-1">
          <li
            v-for="(item, index) in steps"
            :key="item.label"
            class="flex items-start gap-3.5 rounded-lg px-2 py-2.5 transition-colors duration-300"
            :class="index === 0 ? 'bg-cream/[0.07]' : undefined"
            :aria-current="index === 0 ? 'step' : undefined"
          >
            <span
              class="mt-px flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold"
              :class="index === 0 ? 'border-peach text-peach' : 'border-cream/25 text-cream/40'"
            >
              {{ index + 1 }}
            </span>
            <span class="min-w-0">
              <span class="block text-sm" :class="index === 0 ? 'font-medium text-cream' : 'text-cream/40'">
                {{ item.label }}
              </span>
              <span v-if="index === 0" class="mt-0.5 block text-xs leading-relaxed text-cream/60">
                {{ item.hint }}
              </span>
            </span>
          </li>
        </ol>
      </div>

      <p class="relative border-t border-cream/15 pt-6 text-xs leading-relaxed text-cream/60">
        You'll be the owner. Nothing you store here is visible to anyone outside the
        organization.
      </p>
    </aside>

    <main class="flex min-h-0 flex-1 flex-col px-5 sm:px-8">
      <div class="flex shrink-0 items-center justify-between gap-4 py-6">
        <div class="flex items-center gap-2 font-heading font-semibold tracking-tight lg:hidden">
          <span class="size-2.5 rounded-full bg-primary" />
          Batayan
        </div>
        <div class="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Toggle theme"
            class="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            @click="toggleTheme"
          >
            <component :is="isDark ? SunIcon : MoonIcon" class="size-4" />
          </button>
        </div>
      </div>

      <div class="flex min-h-0 flex-1 justify-center pb-8">
        <div class="flex min-h-0 w-full max-w-[26rem] flex-col">
          <!-- Title block stays pinned; only the form below it takes overflow. -->
          <div class="shrink-0">
            <!-- The rail's stepper is off-screen below lg, so the step count
                 carries the sense of place instead. -->
            <p class="text-xs font-medium text-muted-foreground lg:hidden">
              Step 1 of {{ steps.length }}
            </p>

            <h1 class="mt-2 text-[1.75rem] font-semibold leading-tight tracking-tight lg:mt-0">
              Name your organization
            </h1>
            <p class="mt-2 text-sm leading-relaxed text-muted-foreground">
              Use your firm or office name — it's what your colleagues will see when they
              join. You can change it later in Settings.
            </p>
          </div>

          <form class="mt-8 min-h-0 flex-1 space-y-5 overflow-y-auto px-1" novalidate @submit.prevent="handleSubmit">
            <div
              v-if="error"
              role="alert"
              class="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
            >
              <CircleAlertIcon class="mt-px size-4 shrink-0" />
              <span>{{ error }}</span>
            </div>

            <div class="space-y-2">
              <Label for="organization_name">Organization name</Label>
              <Input
                id="organization_name"
                v-model="name"
                autocomplete="organization"
                placeholder="Santos & Associates Law Office"
                maxlength="255"
                autofocus
                required
                class="h-10"
                :aria-invalid="fieldErrors.name ? true : undefined"
                :aria-describedby="fieldErrors.name ? 'organization_name-error' : undefined"
              />
              <p v-if="fieldErrors.name" id="organization_name-error" class="text-xs text-destructive">
                {{ fieldErrors.name }}
              </p>
            </div>

            <!-- Makes the abstract "organization" concrete: this is the workspace
                 as it will appear to the user and anyone they invite. -->
            <div
              v-if="initials"
              class="flex items-center gap-3 rounded-lg border bg-muted/40 px-3.5 py-3"
            >
              <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
                {{ initials }}
              </span>
              <span class="min-w-0">
                <span class="block truncate text-sm font-medium">{{ name.trim() }}</span>
                <span class="block text-xs text-muted-foreground">{{ auth.user?.name }} · Owner</span>
              </span>
            </div>

            <Button type="submit" class="h-10 w-full" :loading="submitting">
              {{ submitting ? 'Creating organization…' : 'Create organization' }}
            </Button>

            <ul class="space-y-1.5 pt-1 text-xs text-muted-foreground">
              <li class="flex items-start gap-2">
                <CheckIcon class="mt-px size-3.5 shrink-0 text-primary" />
                Invite colleagues whenever you're ready — no need to decide now.
              </li>
              <li class="flex items-start gap-2">
                <CheckIcon class="mt-px size-3.5 shrink-0 text-primary" />
                Cases, documents, and templates stay private to your organization.
              </li>
            </ul>
          </form>

          <div class="mt-6 shrink-0 border-t border-border/70 pt-5 text-sm text-muted-foreground">
            Signed in as {{ auth.user?.email }}.
            <button type="button" class="ml-1 font-medium text-primary hover:underline" @click="handleLogout">
              Log out
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
