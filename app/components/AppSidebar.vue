<script setup lang="ts">
import {
  Building2Icon,
  FilePenIcon,
  FileSearchIcon,
  FileTextIcon,
  FolderIcon,
  GaugeIcon,
  HeadphonesIcon,
  LayoutTemplateIcon,
  ListChecksIcon,
  LockIcon,
  MessageCircleIcon,
  MessageSquareIcon,
  ScaleIcon,
  ShieldIcon,
} from '@lucide/vue'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { isAtLimit, limitPct } from '~/stores/billing'

const auth = useAuthStore()
const route = useRoute()
const billing = useBillingStore()
const org = useOrganizationStore()

const navItems = computed(() => [
  { to: '/dashboard', label: 'Dashboard', icon: GaugeIcon, gated: false },
  { to: '/chat', label: 'Chat', icon: MessageSquareIcon, gated: true },
  { to: '/cases', label: 'Cases', icon: FolderIcon, gated: true },
  { to: '/files', label: 'Files', icon: FileTextIcon, gated: true },
  { to: '/drafts', label: 'Drafts', icon: FilePenIcon, gated: true },
  { to: '/vetting', label: 'Vetting', icon: FileSearchIcon, gated: true },
  { to: '/templates', label: 'Templates', icon: LayoutTemplateIcon, gated: true },
  ...(auth.user?.is_admin ? [{ to: '/admin/legal-sources', label: 'Admin', icon: ShieldIcon }] : []),
])

/**
 * The document-vetting workspace sits apart from the ordinary pages: for a
 * verified lawyer it is the home screen, so it renders on top and is separated
 * from the rest of the workspace by its own rule.
 */
const lawyerNavItems = computed(() =>
  auth.isVerifiedLawyer ? [{ to: '/lawyer/dashboard', label: 'Lawyer Dashboard', icon: ScaleIcon }] : [],
)

/**
 * A lock marks each gated workspace page until the user is subscribed; once
 * access is granted it disappears. Nothing is drawn until the subscription has
 * actually answered, so a subscribed user never sees locks flash in while it
 * loads.
 */
const showSubscriptionLock = computed(() => billing.subscriptionLoaded && !billing.accessGranted)

function isActive(to: string) {
  return route.path === to || route.path.startsWith(`${to}/`)
}

/** A workspace page that exists but needs a subscription to be reached. */
function isLocked(item: (typeof navItems.value)[number]) {
  return showSubscriptionLock.value && item.gated
}

const orgName = computed(() => org.organization?.name ?? auth.user?.name ?? 'Batayan')

const seats = computed(() => org.organization?.seats ?? null)

const seatLabel = computed(() => {
  if (!auth.hasOrganization) return 'Personal workspace'
  if (!seats.value) return 'Loading seats…'
  if (seats.value.purchased === null) return 'Seats tied to your plan'
  const free = seats.value.free ?? 0
  return `${free} ${free === 1 ? 'seat' : 'seats'} available`
})

const usageMeters = computed(() => {
  const usage = billing.subscription?.usage
  if (!usage) return []
  return [
    { key: 'messages', label: 'Messages', used: usage.messages.used, limit: usage.messages.limit },
    { key: 'documents', label: 'Documents', used: usage.documents.used, limit: usage.documents.limit },
    { key: 'cases', label: 'Cases', used: usage.active_cases.used, limit: usage.active_cases.limit },
  ]
})

/**
 * Firm and business plans come with a named human on the other end — the rest
 * of the ladder is self-serve. Offering the channel only where it exists
 * keeps the footer honest.
 */
const contactSupport = computed(() => {
  const slug = billing.plan?.slug
  return slug === 'firm' || slug === 'business'
})

const salesEmail = useRuntimeConfig().public.salesEmail
const supportHref = computed(
  () => `mailto:${salesEmail}?subject=${encodeURIComponent('Batayan support request')}`,
)

onMounted(() => {
  if (auth.hasOrganization && !org.organization) {
    void org.fetchOrganization()
  }
})
</script>

<template>
  <Sidebar variant="floating" collapsible="icon" side="left">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            as-child
            :is-active="isActive('/settings/organization')"
            :tooltip="orgName"
          >
            <NuxtLink to="/settings/organization">
              <div
                class="flex aspect-square size-8 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
              >
                <Building2Icon class="size-4" />
              </div>
              <div
                class="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden"
              >
                <span class="truncate font-semibold">{{ orgName }}</span>
                <span class="truncate text-xs text-sidebar-foreground/60">{{ seatLabel }}</span>
              </div>
            </NuxtLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <SidebarSeparator class="group-data-[collapsible=icon]:hidden" />
    </SidebarHeader>

    <SidebarContent>
      <SidebarGroup v-if="lawyerNavItems.length > 0">
        <SidebarGroupLabel>Lawyer</SidebarGroupLabel>
        <SidebarMenu class="space-y-1">
          <SidebarMenuItem v-for="item in lawyerNavItems" :key="item.to">
            <SidebarMenuButton
              as-child
              :is-active="isActive(item.to)"
              :tooltip="item.label"
              :data-tour="`nav-${item.to.replace('/', '')}`"
            >
              <NuxtLink :to="item.to">
                <component :is="item.icon" />
                <span>{{ item.label }}</span>
              </NuxtLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>

      <SidebarSeparator
        v-if="lawyerNavItems.length > 0"
        class="group-data-[collapsible=icon]:hidden"
      />

      <SidebarGroup>
        <SidebarGroupLabel>Workspace</SidebarGroupLabel>
        <SidebarMenu>
          <SidebarMenuItem v-for="item in navItems" :key="item.to">
            <SidebarMenuButton
              v-if="isLocked(item)"
              disabled
              :tooltip="item.label"
              :data-tour="`nav-${item.to.replace('/', '')}`"
            >
              <component :is="item.icon" />
              <span>{{ item.label }}</span>
              <LockIcon
                class="ml-auto size-3.5 shrink-0 text-muted-foreground/50 group-data-[collapsible=icon]:hidden"
                aria-label="Requires a subscription"
              />
            </SidebarMenuButton>
            <SidebarMenuButton
              v-else
              as-child
              :is-active="isActive(item.to)"
              :tooltip="item.label"
              :data-tour="`nav-${item.to.replace('/', '')}`"
            >
              <NuxtLink :to="item.to">
                <component :is="item.icon" />
                <span>{{ item.label }}</span>
              </NuxtLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>

    <SidebarFooter>
      <!-- Above usage: what to do next outranks how much of the plan is left. -->
      <SidebarTasks />

      <SidebarMenu v-if="usageMeters.length > 0">
        <SidebarMenuItem>
          <Popover>
            <PopoverTrigger as-child>
              <SidebarMenuButton
                :tooltip="'Usage'"
                class="hidden group-data-[collapsible=icon]:flex"
              >
                <GaugeIcon />
                <span>Usage</span>
              </SidebarMenuButton>
            </PopoverTrigger>
            <PopoverContent side="right" align="start" class="w-64 p-3">
              <div class="flex items-center justify-between pb-1.5">
                <span class="text-sm font-medium text-sidebar-foreground/70">Usage</span>
                <NuxtLink
                  to="/settings/billing"
                  class="text-xs font-medium text-primary hover:underline"
                >
                  View
                </NuxtLink>
              </div>
              <div v-for="meter in usageMeters" :key="meter.key" class="px-1 py-0.5">
                <div class="flex items-center justify-between gap-2 text-xs leading-tight">
                  <span class="text-sidebar-foreground/80">{{ meter.label }}</span>
                  <span class="text-sidebar-foreground/50">
                    {{ meter.used.toLocaleString() }}{{ meter.limit ? ` / ${meter.limit.toLocaleString()}` : '' }}
                  </span>
                </div>
                <div class="mt-1 h-1 overflow-hidden rounded-full bg-sidebar-accent">
                  <div
                    class="h-full rounded-full transition-all"
                    :class="isAtLimit(meter.used, meter.limit) ? 'bg-destructive' : limitPct(meter.used, meter.limit) > 80 ? 'bg-espresso' : 'bg-primary'"
                    :style="{ width: `${limitPct(meter.used, meter.limit)}%` }"
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </SidebarMenuItem>
      </SidebarMenu>

      <div
        v-if="usageMeters.length > 0"
        class="rounded-xl border border-sidebar-border/70 bg-sidebar-accent/40 p-2 group-data-[collapsible=icon]:hidden"
      >
        <div class="flex items-center justify-between px-1 pb-1.5">
          <span class="text-sm font-medium text-sidebar-foreground/70">Usage</span>
          <NuxtLink
            to="/settings/billing"
            class="text-xs font-medium text-primary hover:underline"
          >
            View
          </NuxtLink>
        </div>
        <div v-for="meter in usageMeters" :key="meter.key" class="px-1 py-0.5">
          <div class="flex items-center justify-between gap-2 text-xs leading-tight">
            <span class="text-sidebar-foreground/80">{{ meter.label }}</span>
            <span class="text-sidebar-foreground/50">
              {{ meter.used.toLocaleString() }}{{ meter.limit ? ` / ${meter.limit.toLocaleString()}` : '' }}
            </span>
          </div>
          <div class="mt-1 h-1 overflow-hidden rounded-full bg-sidebar-accent">
            <div
              class="h-full rounded-full transition-all"
              :class="isAtLimit(meter.used, meter.limit) ? 'bg-destructive' : limitPct(meter.used, meter.limit) > 80 ? 'bg-espresso' : 'bg-primary'"
              :style="{ width: `${limitPct(meter.used, meter.limit)}%` }"
            />
          </div>
        </div>
      </div>

      <SidebarMenu v-if="contactSupport">
<SidebarMenuItem class="list-none group-data-[collapsible=icon]:hidden">
          <div class="rounded-xl border border-sidebar-border/70 bg-sidebar-accent/40 p-2.5">
            <div class="flex items-center gap-2.5">
              <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <HeadphonesIcon class="size-4" />
              </div>
              <div class="min-w-0">
                <p class="truncate text-xs font-semibold text-sidebar-foreground">Need help?</p>
                <p class="truncate text-[11px] text-sidebar-foreground/60">24/7 support included</p>
              </div>
            </div>
            <a
              :href="supportHref"
              target="_blank"
              rel="noreferrer"
              class="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-primary px-2 py-1.5 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <MessageCircleIcon class="size-3.5" />
              Contact support
            </a>
          </div>
        </SidebarMenuItem>
        <SidebarMenuItem class="hidden group-data-[collapsible=icon]:flex">
          <SidebarMenuButton as-child :tooltip="'Contact 24/7 support'">
            <a :href="supportHref" target="_blank" rel="noreferrer">
              <HeadphonesIcon />
              <span>Contact 24/7 support</span>
            </a>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>

    <SidebarRail />
  </Sidebar>
</template>