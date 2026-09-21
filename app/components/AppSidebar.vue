<script setup lang="ts">
import {
  BellIcon,
  Building2Icon,
  CreditCardIcon,
  FilePenIcon,
  FileSearchIcon,
  FileTextIcon,
  FolderIcon,
  GaugeIcon,
  HeadphonesIcon,
  LayoutTemplateIcon,
  ListChecksIcon,
  LockIcon,
  LogOutIcon,
  MessageCircleIcon,
  MessageSquareIcon,
  MoonIcon,
  PuzzleIcon,
  ScaleIcon,
  Settings2Icon,
  ShieldIcon,
  SparklesIcon,
  SunIcon,
  UsersRoundIcon,
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
  useSidebar,
} from '@/components/ui/sidebar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { isAtLimit, limitPct } from '~/stores/billing'
import { useNotificationStore } from '~/stores/notifications'

const auth = useAuthStore()
const route = useRoute()
const { setOpenMobile } = useSidebar()
const billing = useBillingStore()
const org = useOrganizationStore()
const notificationStore = useNotificationStore()
const { isDark, toggle: toggleTheme } = useTheme()
const tour = useProductTour()

onMounted(() => void notificationStore.fetchUnreadCount())

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

const navItems = computed(() => [
  { to: '/dashboard', label: 'Dashboard', icon: GaugeIcon, gated: false },
  { to: '/chat', label: 'Chat', icon: MessageSquareIcon, gated: true },
  { to: '/cases', label: 'Cases', icon: FolderIcon, gated: true },
  { to: '/crm/clients', label: 'Clients', icon: UsersRoundIcon, gated: true },
  { to: '/files', label: 'Files', icon: FileTextIcon, gated: true },
  { to: '/drafts', label: 'Drafts', icon: FilePenIcon, gated: true },
  { to: '/vetting', label: 'Vetting', icon: FileSearchIcon, gated: true },
  { to: '/templates', label: 'Templates', icon: LayoutTemplateIcon, gated: true },
  { to: '/todos', label: 'Todos', icon: ListChecksIcon, gated: true },
])

/**
 * Notifications and settings are reachable from every plan state, so they sit
 * apart from the gated workspace items — same treatment Dashboard gets.
 */
const utilityNavItems = computed(() => [
  { to: '/notifications', label: 'Notifications', icon: BellIcon },
  { to: '/settings/organization', label: 'Settings', icon: Settings2Icon },
])

/**
 * The document-vetting workspace sits apart from the ordinary pages: for a
 * verified lawyer it is the home screen, so it renders on top and is separated
 * from the rest of the workspace by its own rule.
 */
const lawyerNavItems = computed(() =>
  auth.isVerifiedLawyer ? [{ to: '/lawyer/dashboard', label: 'Lawyer Dashboard', icon: ScaleIcon }] : [],
)

const adminNavItems = computed(() =>
  auth.user?.is_admin ? [{ to: '/admin/legal-sources', label: 'Admin', icon: ShieldIcon }] : [],
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

// A mobile drawer should not remain over the destination after navigation.
watch(() => route.fullPath, () => setOpenMobile(false))

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
  const aiUsage = billing.subscription?.usage.ai_usage
  if (!aiUsage) return []
  // One percent meter: the template's used/limit math reads it as-is.
  return [
    { key: 'ai_usage', label: 'AI usage', used: Math.round(aiUsage.percent), limit: 100 },
  ]
})

/**
 * Firm comes with a named human on the other end — the rest of the ladder is
 * self-serve. Offering the channel only where it exists keeps the footer honest.
 */
const contactSupport = computed(() => {
  const slug = billing.plan?.slug
  return slug === 'firm'
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
  <Sidebar variant="sidebar" collapsible="icon" side="left">
    <SidebarHeader class="pr-12 md:pr-2 group-data-[collapsible=icon]:pr-0">
      <!-- The brand mark, not the account — the account lives at the bottom of the rail. -->
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton as-child :is-active="isActive('/chat')" tooltip="Batayan">
            <NuxtLink to="/chat">
              <span class="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <BatayanMark class="size-4" />
              </span>
              <span class="font-heading font-semibold">Batayan</span>
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

      <SidebarSeparator class="group-data-[collapsible=icon]:hidden" />

      <SidebarGroup>
        <SidebarMenu>
          <SidebarMenuItem v-for="item in utilityNavItems" :key="item.to">
            <SidebarMenuButton
              as-child
              :is-active="isActive(item.to)"
              :tooltip="item.label"
              :data-tour="`nav-${item.to.replace('/', '')}`"
            >
              <NuxtLink :to="item.to">
                <span class="relative inline-flex">
                  <component :is="item.icon" />
                  <span
                    v-if="item.to === '/notifications' && notificationStore.unreadCount > 0"
                    class="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-destructive"
                    aria-hidden="true"
                  />
                </span>
                <span>{{ item.label }}</span>
              </NuxtLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>

      <SidebarGroup v-if="adminNavItems.length > 0">
        <SidebarGroupLabel>Admin</SidebarGroupLabel>
        <SidebarMenu>
          <SidebarMenuItem v-for="item in adminNavItems" :key="item.to">
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
    </SidebarContent>

    <SidebarFooter>
      <!--
        "Batayan is replying" used to live in the header, the one place always
        on screen — now that the header is gone, the rail is that place.
      -->
      <ChatStreamingIndicator class="mb-1 group-data-[collapsible=icon]:hidden" />

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

      <SidebarSeparator class="mx-0 w-full" />

      <!--
        The signed-in person and the theme, at the very bottom — the two things
        that belong to the person using the rail, not to the workspace. Two
        separate menus, not one, so the footer's own gap keeps them apart
        instead of sitting flush against each other.
      -->
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <SidebarMenuButton size="lg" :tooltip="auth.user?.name ?? 'Account'">
                <Avatar class="size-8 shrink-0">
                  <AvatarFallback class="bg-sidebar-primary text-xs text-sidebar-primary-foreground">
                    {{ initials }}
                  </AvatarFallback>
                </Avatar>
                <div class="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                  <span class="truncate font-semibold">{{ auth.user?.name ?? 'Account' }}</span>
                  <span class="truncate text-xs text-sidebar-foreground/60">{{ seatLabel }}</span>
                </div>
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" class="w-56">
              <DropdownMenuLabel class="flex flex-col">
                <span class="text-sm font-medium">{{ auth.user?.name }}</span>
                <span class="text-xs text-muted-foreground">{{ auth.user?.email }}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem @click="navigateTo('/settings/organization')">
                  <Building2Icon />
                  {{ orgName }}
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
              <DropdownMenuItem @click="tour.restart()">
                <SparklesIcon />
                Show me around
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" @click="handleLogout">
                <LogOutIcon />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            :tooltip="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
            @click="toggleTheme"
          >
            <component :is="isDark ? SunIcon : MoonIcon" />
            <span>{{ isDark ? 'Light mode' : 'Dark mode' }}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>

    <SidebarRail />
  </Sidebar>
</template>
