<script setup lang="ts">
import {
  Building2Icon,
  CreditCardIcon,
  LogOutIcon,
  MenuIcon,
  MoonIcon,
  Settings2Icon,
  SparklesIcon,
  SunIcon,
  XIcon,
} from '@lucide/vue'

const auth = useAuthStore()
const route = useRoute()
const { isDark, toggle: toggleTheme } = useTheme()
const billing = useBillingStore()
const tour = useProductTour()

// Offered once onboarding is done, so a first-time user is not interrupted
// while still choosing their role. Watched rather than checked on mount: the
// profile can resolve after the layout renders, and onboarding lives on the
// bare layout, so the flag may flip while this layout is already up. Shown
// once per user; replayable from the account menu.
watch(
  () => auth.kycCompleted,
  (completed) => {
    if (completed) tour.maybeStart()
  },
  { immediate: true },
)

const navItems = computed(() => [
  { to: '/chat', label: 'Chat' },
  { to: '/cases', label: 'Cases' },
  { to: '/documents', label: 'Documents' },
  { to: '/drafts', label: 'Drafts' },
  { to: '/templates', label: 'Templates' },
  ...(auth.user?.is_admin ? [{ to: '/admin/legal-sources', label: 'Admin' }] : []),
])

function isActive(to: string) {
  return route.path === to || route.path.startsWith(`${to}/`)
}

const mobileOpen = ref(false)

// Closing the drawer after navigating keeps the back button from resurrecting
// a stale menu, and mirrors what the old dropdown did on select.
watch(
  () => route.path,
  () => {
    mobileOpen.value = false
  },
)

async function handleLogout() {
  await auth.logout()
  await navigateTo('/login')
}

const initials = computed(() =>
  String(auth.user?.name ?? '')
    .split(/\s+/)
    .map((part: string) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase(),
)

onMounted(() => {
  if (auth.user) {
    void billing.fetchSubscription()
  }
})
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-background text-foreground">
    <!--
      A full-width band on --card so it stays a distinct plane from the page
      scrolling beneath it. The active page is a tinted pill with a hairline
      ring; on mobile the links fall into a slide-down drawer under the bar.
    -->
    <header v-if="auth.user" class="sticky top-0 z-40 border-b border-border bg-card/85 backdrop-blur-md">
      <div class="flex h-14 w-full items-center gap-2 px-4 sm:gap-4">
        <button
          type="button"
          :aria-label="mobileOpen ? 'Close navigation menu' : 'Open navigation menu'"
          :aria-expanded="mobileOpen"
          class="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
          @click="mobileOpen = !mobileOpen"
        >
          <XIcon v-if="mobileOpen" class="size-5" />
          <MenuIcon v-else class="size-5" />
        </button>

        <NuxtLink to="/chat" class="flex shrink-0 items-center gap-2.5" aria-label="Batayan">
          <span class="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
            <BatayanMark class="size-[1.1rem]" />
          </span>
          <span class="whitespace-nowrap font-heading text-lg font-semibold tracking-tight">
            Batayan
          </span>
        </NuxtLink>

        <nav class="hidden items-center gap-1 text-sm md:flex" aria-label="Primary">
          <NuxtLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            :data-tour="`nav-${item.to.replace('/', '')}`"
            class="rounded-md px-3 py-1.5 transition-colors"
            :class="isActive(item.to)
              ? 'bg-muted font-medium text-foreground ring-1 ring-border'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
          >
            {{ item.label }}
          </NuxtLink>
        </nav>

        <div class="ml-auto flex items-center gap-1">
          <ChatStreamingIndicator class="mr-1" />
          <TasksDropdown class="hidden md:block" />
          <NotificationsDropdown />
          <button
            type="button"
            aria-label="Toggle theme"
            class="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            @click="toggleTheme"
          >
            <component :is="isDark ? SunIcon : MoonIcon" class="size-4" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              class="flex shrink-0 items-center gap-2 rounded-full p-1 pr-3 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <Avatar class="size-7">
                <AvatarFallback class="bg-primary text-primary-foreground text-xs">
                  {{ initials }}
                </AvatarFallback>
              </Avatar>
              <span class="hidden text-sm font-medium sm:block">{{ auth.user?.name }}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-56">
              <DropdownMenuLabel class="flex flex-col">
                <span class="text-sm font-medium">{{ auth.user?.name }}</span>
                <span class="text-muted-foreground text-xs">{{ auth.user?.email }}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem v-if="!auth.hasOrganization" @click="navigateTo('/organization/setup')">
                  <Building2Icon />
                  Set up organization
                </DropdownMenuItem>
                <DropdownMenuItem v-if="auth.hasOrganization" @click="navigateTo('/settings/organization')">
                  <Building2Icon />
                  Manage organization
                </DropdownMenuItem>
                <DropdownMenuItem @click="navigateTo('/settings/billing')">
                  <CreditCardIcon />
                  Billing
                </DropdownMenuItem>
                <DropdownMenuItem @click="navigateTo('/settings/personalization')">
                  <Settings2Icon />
                  Personalization
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem @click="tour.restart()">
                  <SparklesIcon />
                  Show me around
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" @click="handleLogout">
                <LogOutIcon />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <!--
        Slide-down drawer for small screens. Kept in the DOM and collapsed with
        grid-rows so the open/close animates; inert while shut so focus stays
        on the bar.
      -->
      <div
        class="grid overflow-hidden border-t border-border transition-[grid-template-rows] duration-300 ease-out md:hidden"
        :class="mobileOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
        :inert="!mobileOpen"
        aria-hidden="true"
      >
        <div class="min-h-0">
          <nav class="flex flex-col gap-0.5 px-4 py-3" aria-label="Mobile">
            <NuxtLink
              v-for="item in navItems"
              :key="item.to"
              :to="item.to"
              class="rounded-md px-3 py-2 text-sm transition-colors"
              :class="isActive(item.to)
                ? 'bg-muted font-medium text-foreground ring-1 ring-border'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
              @click="mobileOpen = false"
            >
              {{ item.label }}
            </NuxtLink>
          </nav>

          <div class="flex items-center justify-between gap-2 border-t border-border/70 px-4 py-3">
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">{{ auth.user?.name }}</p>
              <p class="truncate text-xs text-muted-foreground">{{ auth.user?.email }}</p>
            </div>
            <button
              type="button"
              aria-label="Log out"
              class="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
              @click="handleLogout"
            >
              <LogOutIcon class="size-4" />
            </button>
          </div>
        </div>
      </div>
    </header>

    <main class="flex flex-1 flex-col">
      <slot />
    </main>

    <TourIntro />
    <ProductTour />
    <WelcomeDialog />
  </div>
</template>
