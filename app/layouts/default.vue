<script setup lang="ts">
import TaskDetailPanel from '~/components/TaskDetailPanel.vue'

const auth = useAuthStore()
const billing = useBillingStore()
const tour = useProductTour()
const { selectedTodo, closeTodo } = useTaskDetailPanel()
const { letterDraft, closeLetterDraft } = useLetterDraftPanel()

// Offered once onboarding is done, so a first-time user is not interrupted
// while still choosing their role. Watched rather than checked on mount: the
// profile can resolve after the layout renders, and onboarding lives on the
// bare layout, so the flag may flip while this layout is already up. A lawyer
// application skips the KYC questions, so verification stands in for it there.
// Shown once per user; replayable from the account menu in the sidebar.
watch(
  () => [auth.kycCompleted, auth.isVerifiedLawyer],
  () => tour.maybeStart(),
  { immediate: true },
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
      The sidebar is a flush icon rail collapsed by default; on small screens
      it becomes a slide-in sheet. Navigation, the account menu, and usage all
      live here — there is no top bar, so the sidebar carries the whole shell.
    -->
    <AppSidebar v-if="auth.user" />

    <SidebarInset>
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
