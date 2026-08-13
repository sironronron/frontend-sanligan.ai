<script setup lang="ts">
import { MenuIcon, MoonIcon, SunIcon } from '@lucide/vue'

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
  { to: '/generated-documents', label: 'Generated' },
  { to: '/templates', label: 'Templates' },
  ...(auth.user?.is_admin ? [{ to: '/admin/legal-sources', label: 'Admin' }] : []),
])

function isActive(to: string) {
  return route.path === to || route.path.startsWith(`${to}/`)
}

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
    <header v-if="auth.user" class="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div class="flex h-14 w-full max-w-full items-center gap-2 px-4 sm:gap-6">
        <DropdownMenu>
          <DropdownMenuTrigger
            class="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
            aria-label="Open navigation menu"
          >
            <MenuIcon class="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="w-52 md:hidden">
            <DropdownMenuItem v-for="item in navItems" :key="item.to" @select="navigateTo(item.to)">
              <span :class="isActive(item.to) ? 'font-medium text-foreground' : 'text-muted-foreground'">
                {{ item.label }}
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <NuxtLink to="/chat" class="flex shrink-0 items-center gap-2 font-heading font-semibold tracking-tight">
          <span class="size-2.5 rounded-full bg-primary" />
          Batayan
        </NuxtLink>

        <nav class="hidden items-center gap-1 text-sm md:flex">
          <NuxtLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            :data-tour="`nav-${item.to.replace('/', '')}`"
            class="rounded-md px-3 py-1.5 transition-colors hover:bg-muted"
            :class="isActive(item.to) ? 'bg-muted font-medium' : 'text-muted-foreground'"
          >
            {{ item.label }}
          </NuxtLink>
        </nav>

        <div class="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Toggle theme"
            class="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            @click="toggleTheme"
          >
            <component :is="isDark ? SunIcon : MoonIcon" class="size-4" />
          </button>
          <TasksDropdown class="hidden md:block" />
          <DropdownMenu>
            <DropdownMenuTrigger
              class="flex items-center gap-2 rounded-full p-1 pr-3 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <Avatar class="size-7">
                <AvatarFallback class="bg-primary text-primary-foreground text-xs">
                  {{ initials }}
                </AvatarFallback>
              </Avatar>
              <span class="hidden text-sm font-medium sm:block">{{ auth.user?.name }}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-44">
              <DropdownMenuLabel class="flex flex-col">
                <span class="text-sm font-medium">{{ auth.user?.name }}</span>
                <span class="text-muted-foreground text-xs">{{ auth.user?.email }}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem v-if="!auth.hasOrganization" @click="navigateTo('/organization/setup')">
                Set up organization
              </DropdownMenuItem>
              <DropdownMenuItem v-if="auth.hasOrganization" @click="navigateTo('/settings/organization')">
                Manage organization
              </DropdownMenuItem>
              <DropdownMenuItem @click="navigateTo('/settings/billing')">
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem @click="navigateTo('/settings/personalization')">
                Personalization
              </DropdownMenuItem>
              <DropdownMenuItem @click="tour.restart()">
                Show me around
              </DropdownMenuItem>
              <DropdownMenuItem @click="handleLogout">
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>

    <main class="flex flex-1 flex-col">
      <slot />
    </main>

    <ProductTour />
    <WelcomeDialog />
  </div>
</template>
