<script setup lang="ts">
import { ArrowRightIcon, FolderLockIcon, Loader2Icon, LockIcon, LogOutIcon, MoonIcon, RotateCcwIcon, SunIcon, UserRoundIcon } from '@lucide/vue'
import { toast } from '~/components/ui/sonner'

definePageMeta({
  layout: 'bare',
  middleware: ['auth'],
})

const auth = useAuthStore()
const { isDark, toggle: toggleTheme } = useTheme()

const leaving = ref(false)
const confirmOpen = ref(false)

const organizationName = computed(() => auth.user?.organization_name ?? 'your organization')

/** A workspace monogram, the same one the invitation card uses. */
const orgInitials = computed(() => {
  const words = (auth.user?.organization_name ?? '').trim().split(/\s+/).filter(Boolean)

  if (words.length === 0) return 'B'

  return words.slice(0, 2).map(word => word[0]?.toUpperCase() ?? '').join('')
})

/**
 * The three things a suspended member actually wants to know, in the order
 * they worry about them: is my work gone, is this permanent, and what can I
 * do now. Answering them here is what keeps the page from reading as a wall.
 */
const factList = computed(() => [
  {
    icon: FolderLockIcon,
    title: 'Nothing has been deleted',
    body: `The cases, documents, and drafts you worked on stay with ${organizationName.value} exactly as you left them.`,
  },
  {
    icon: RotateCcwIcon,
    title: 'This can be undone',
    body: 'An administrator can reactivate your seat at any time, and your access returns immediately.',
  },
  {
    icon: UserRoundIcon,
    title: 'Your account is still yours',
    body: 'Your sign-in, profile, and anything you create on a plan of your own are unaffected.',
  },
])

/**
 * Someone who is no longer suspended has no business on this screen — an
 * admin may have reinstated them in the tab next door, and the reload that
 * follows would otherwise strand them here.
 */
watchEffect(() => {
  if (auth.initialized && auth.user && !auth.isSuspended) {
    navigateTo(auth.homePath())
  }
})

/**
 * Giving up the seat is the one thing this account can still do. Afterwards it
 * is an ordinary account with no subscription behind it, so the price list is
 * where it belongs — and the billing store has to be re-read, since the
 * organization's plan is no longer theirs.
 */
async function leaveOrganization() {
  if (leaving.value) return

  leaving.value = true

  try {
    await auth.leaveOrganization()
    await useBillingStore().fetchSubscription()
    confirmOpen.value = false
    await navigateTo('/pricing')
  } catch (err) {
    toast.error(parseApiError(err, 'You could not be removed from this organization.').message)
  } finally {
    leaving.value = false
  }
}

async function handleLogout() {
  await auth.logout()
  await navigateTo('/login')
}
</script>

<template>
  <div class="flex flex-1 flex-col">
    <!--
      Deliberately not the `minimal` layout's header: every link in it —
      organization, billing — is a door closed to this account, and offering
      them would be the second refusal in a row.
    -->
    <header class="flex h-14 shrink-0 items-center gap-3 px-4">
      <span class="flex items-center gap-2 font-heading font-semibold tracking-tight">
        <span class="size-2.5 rounded-full bg-primary" aria-hidden="true" />
        Batayan
      </span>

      <div class="ml-auto flex items-center gap-1">
        <button
          type="button"
          aria-label="Toggle theme"
          class="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          @click="toggleTheme"
        >
          <component :is="isDark ? SunIcon : MoonIcon" class="size-4" />
        </button>
        <Button variant="ghost" size="sm" @click="handleLogout">
          <LogOutIcon />
          Log out
        </Button>
      </div>
    </header>

    <main class="flex flex-1 items-center justify-center px-4 pb-16 pt-4">
      <div class="w-full max-w-lg">
        <div class="text-center">
          <p class="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-destructive">
            <span class="h-px w-8 bg-destructive opacity-40" aria-hidden="true" />
            Access suspended
            <span class="h-px w-8 bg-destructive opacity-40" aria-hidden="true" />
          </p>

          <h1 class="mx-auto mt-3 font-heading text-2xl font-medium leading-[1.15] tracking-tight sm:text-3xl">
            Your seat has been paused
          </h1>

          <p class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
            An administrator suspended your access. Until they reactivate it, this is
            the only page open to you.
          </p>
        </div>

        <!--
          The workspace leads on a pine band, mirroring the invitation card on
          /pricing: the same object, at the other end of the relationship.
        -->
        <section class="surface mt-8 overflow-hidden">
          <div class="flex items-center gap-4 bg-pine px-5 py-5 text-cream sm:px-6">
            <span
              aria-hidden="true"
              class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-cream/10 font-heading text-lg font-medium tracking-tight text-peach"
            >
              {{ orgInitials }}
            </span>
            <div class="min-w-0">
              <p class="truncate font-heading text-lg font-medium tracking-tight">
                {{ organizationName }}
              </p>
              <p class="mt-0.5 flex items-center gap-1.5 text-sm text-cream/70">
                <LockIcon class="size-3.5 shrink-0" aria-hidden="true" />
                {{ auth.user?.email }}
              </p>
            </div>
          </div>

          <ul class="divide-y divide-border">
            <li v-for="fact in factList" :key="fact.title" class="flex items-start gap-3.5 px-5 py-4 sm:px-6">
              <span
                aria-hidden="true"
                class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
              >
                <component :is="fact.icon" class="size-4" />
              </span>
              <div class="min-w-0">
                <p class="text-sm font-medium">
                  {{ fact.title }}
                </p>
                <p class="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                  {{ fact.body }}
                </p>
              </div>
            </li>
          </ul>
        </section>

        <!--
          The one action left, and the only reason this page is not a dead end.
          It sits apart from the card above so it never reads as a step in the
          explanation — leaving is a decision, not the next paragraph.
        -->
        <section class="surface-inset mt-4 px-5 py-5 sm:px-6">
          <h2 class="font-heading text-base font-medium tracking-tight">
            Not coming back?
          </h2>
          <p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            You can leave {{ organizationName }} and continue on a plan of your own.
            Work you created inside the workspace stays with it, and rejoining later
            needs a fresh invitation.
          </p>

          <Button class="mt-4 w-full sm:w-auto" variant="outline" :disabled="leaving" @click="confirmOpen = true">
            Leave and see plans
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </section>

        <p class="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          Think this is a mistake? Ask an administrator at {{ organizationName }} to
          reactivate your seat — nothing needs to be set up again.
        </p>
      </div>
    </main>

    <AlertDialog v-model:open="confirmOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave {{ organizationName }}?</AlertDialogTitle>
          <AlertDialogDescription>
            Your seat is given up immediately and you lose access to everything the
            workspace owns. To come back you will need a new invitation from an
            administrator. You will be taken to the plans page next.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="leaving">
            Stay
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" :disabled="leaving" @click.prevent="leaveOrganization">
            <Loader2Icon v-if="leaving" class="size-4 animate-spin" />
            {{ leaving ? 'Leaving…' : 'Leave organization' }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
