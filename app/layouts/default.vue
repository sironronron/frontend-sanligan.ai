<script setup lang="ts">
import {
  Building2Icon,
  CreditCardIcon,
  LogOutIcon,
  MoonIcon,
  PuzzleIcon,
  Settings2Icon,
  SparklesIcon,
  SunIcon,
} from '@lucide/vue'
import TaskDetailPanel from '~/components/TaskDetailPanel.vue'

const auth = useAuthStore()
const { isDark, toggle: toggleTheme } = useTheme()
const billing = useBillingStore()
const tour = useProductTour()
const { selectedTodo, closeTodo } = useTaskDetailPanel()
const { letterDraft, closeLetterDraft } = useLetterDraftPanel()

// Offered once onboarding is done, so a first-time user is not interrupted
// while still choosing their role. Watched rather than checked on mount: the
// profile can resolve after the layout renders, and onboarding lives on the
// bare layout, so the flag may flip while this layout is already up. A lawyer
// application skips the KYC questions, so verification stands in for it there.
// Shown once per user; replayable from the account menu.
watch(
  () => [auth.kycCompleted, auth.isVerifiedLawyer],
  () => tour.maybeStart(),
  { immediate: true },
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
  <div class="min-h-dvh bg-background text-foreground">
    <!--
      This wrapper is the layout's single root, so Nuxt's layout transition has
      one element to animate — the sidebar provider alone renders through a
      Fragment (TooltipProvider). The note lives inside it rather than above it
      because a comment at template root counts as a second root node (E4002).
    -->
    <SidebarProvider>
    <!--
      The floating sidebar is a detached panel with xl radius; on small screens
      it becomes a slide-in sheet. Navigation, the organization, seats, and
      usage all live here — the pill header above carries only session actions.
    -->
    <AppSidebar v-if="auth.user" />

    <SidebarInset>
      <!--
        A floating pill rather than a full-width bar: it sits detached over the
        page, blurs what scrolls beneath, and stays put on scroll. The nav that
        used to fill it now lives in the sidebar.
      -->
      <header v-if="auth.user" class="sticky top-4 z-40 mt-4 px-4 md:px-6">
        <div
          class="flex h-14 items-center gap-1 rounded-2xl border border-border bg-card/90 px-2 shadow-float backdrop-blur-md sm:gap-2 sm:px-3"
        >
          <SidebarTrigger class="shrink-0 rounded-full" />

          <NuxtLink to="/chat" class="flex shrink-0 items-center gap-2.5 pl-1 pr-2" aria-label="Batayan">
            <span class="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
              <BatayanMark class="size-[1.1rem]" />
            </span>
            <span class="whitespace-nowrap font-heading text-lg font-semibold tracking-tight">
              Batayan
            </span>
          </NuxtLink>

          <div class="ml-auto flex items-center gap-1">
            <ChatStreamingIndicator class="mr-1" />
            <NotificationsDropdown />
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
                  <!--
                    One entry either way. The settings page answers for both the
                    account that has a team and the one that could have: sending
                    everyone there beats a menu item that offers to set up
                    something the plan may not carry.
                  -->
                  <DropdownMenuItem @click="navigateTo('/settings/organization')">
                    <Building2Icon />
                    Organization
                  </DropdownMenuItem>
                  <DropdownMenuItem @click="navigateTo('/settings/billing')">
                    <CreditCardIcon />
                    Billing
                  </DropdownMenuItem>
                  <DropdownMenuItem @click="navigateTo('/settings/addons')">
                    <PuzzleIcon />
                    Add-ons
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
            <button
              type="button"
              aria-label="Toggle theme"
              class="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              @click="toggleTheme"
            >
              <component :is="isDark ? SunIcon : MoonIcon" class="size-4" />
            </button>
          </div>
        </div>
      </header>

      <main class="flex min-w-0 flex-1 flex-col">
        <slot />
      </main>
    </SidebarInset>

    <TourIntro />
    <ProductTour />
    <WelcomeDialog />
    <TaskDetailPanel
      v-if="selectedTodo"
      :todo="selectedTodo"
      :open="!!selectedTodo"
      @close="closeTodo"
    />
    <LetterDraftPanel
      v-if="letterDraft"
      :draft="letterDraft"
      :open="!!letterDraft"
      @close="closeLetterDraft"
    />
    </SidebarProvider>
  </div>
</template>