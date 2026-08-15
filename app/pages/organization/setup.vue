<script setup lang="ts">
import { CheckIcon, CircleAlertIcon } from '@lucide/vue'

definePageMeta({
  middleware: 'auth',
  layout: 'default',
})

const auth = useAuthStore()
const billing = useBillingStore()

if (auth.hasOrganization) {
  await navigateTo('/settings/organization')
}

// Reached deliberately rather than routed to, so it has to answer for itself
// what happens when the plan cannot hold a team: send them to compare plans
// instead of letting them name a workspace the API would refuse to create.
if (!auth.user?.is_admin) {
  if (!billing.subscription) {
    await billing.fetchSubscription()
  }

  if (!billing.hasFeature('teams')) {
    await navigateTo('/pricing')
  }
}

/**
 * The stepper. This is no longer part of signing up — teams are a paid
 * capability, so an account reaches this screen deliberately, from settings,
 * once it is on a plan that carries seats. The steps therefore describe
 * building the team rather than finishing a join flow.
 */
const steps = [
  { label: 'Name your organization', hint: 'The workspace your matters live in.' },
  { label: 'Invite your colleagues', hint: 'Each seat gets its own allowance.' },
  { label: 'Work on shared matters', hint: 'Cases, documents, and templates in common.' },
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
    // Straight to the team settings: whoever got here already has a plan and
    // has answered the onboarding questions, so the only thing left to do with
    // a new organization is put people in it.
    await navigateTo('/settings/organization')
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
  <div class="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6">
    <PageHeader
      title="Create your organization"
      description="The workspace your cases, documents, and templates live in — and what colleagues join when you invite them."
    />

    <!-- The stepper, condensed to a horizontal strip now that the sidebar and
         pill header own the page chrome. Step one is active by construction:
         the form below only ever asks for the organization name. -->
    <ol class="mb-8 flex items-center gap-2" aria-label="Organization setup steps">
      <li
        v-for="(item, index) in steps"
        :key="item.label"
        class="flex flex-1 items-center gap-2"
        :aria-current="index === 0 ? 'step' : undefined"
      >
        <span
          class="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold"
          :class="index === 0 ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'"
        >
          {{ index + 1 }}
        </span>
        <span
          class="min-w-0 truncate text-sm"
          :class="index === 0 ? 'font-medium text-foreground' : 'text-muted-foreground'"
        >
          {{ item.label }}
        </span>
        <span v-if="index < steps.length - 1" class="h-px flex-1 bg-border" aria-hidden="true" />
      </li>
    </ol>

    <Card>
      <CardContent class="space-y-5 px-6 py-8 sm:px-8">
        <div v-if="error" role="alert" class="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          <CircleAlertIcon class="mt-px size-4 shrink-0" />
          <span>{{ error }}</span>
        </div>

        <form class="space-y-5" novalidate @submit.prevent="handleSubmit">
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
            class="surface-inset flex items-center gap-3 px-3.5 py-3"
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
        </form>

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
      </CardContent>
    </Card>

    <p class="mt-6 shrink-0 text-sm text-muted-foreground">
      Signed in as {{ auth.user?.email }}.
      <button type="button" class="ml-1 font-medium text-primary hover:underline" @click="handleLogout">
        Log out
      </button>
    </p>
  </div>
</template>
