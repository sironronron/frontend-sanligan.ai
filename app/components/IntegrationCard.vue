<script setup lang="ts">
import {
  AlertTriangleIcon,
  Loader2Icon,
  LockIcon,
  PlugIcon,
  RefreshCcwIcon,
  SparklesIcon,
  UnplugIcon,
} from '@lucide/vue'
import type { IntegrationProvider } from '~/stores/integrations'
import { timeAgo } from '~/utils/time'

const props = defineProps<{
  provider: IntegrationProvider
  /** Whether the current plan carries add-ons; a false card renders locked. */
  eligible: boolean
  busy: boolean
}>()

const emit = defineEmits<{
  connect: []
  upgrade: []
  toggle: [capability: string, enabled: boolean]
  sync: []
  reauthorize: []
  disconnect: []
}>()

const connection = computed(() => props.provider.connection)
const isConnected = computed(() => connection.value?.status === 'connected')
const needsReauth = computed(() => connection.value?.status === 'needs_reauthorization')
const isPaused = computed(() => connection.value?.status === 'paused')

const statusLabel = computed(() => {
  if (needsReauth.value) return 'Needs reauthorization'
  if (isPaused.value) return 'Paused'
  if (isConnected.value) return 'Connected'
  return 'Not connected'
})

const statusStyles = computed(() => {
  if (needsReauth.value) return 'bg-espresso/10 text-espresso dark:bg-cream/10 dark:text-peach'
  if (isPaused.value) return 'bg-muted text-muted-foreground'
  if (isConnected.value) return 'bg-forest/10 text-forest dark:bg-cream/10 dark:text-peach'
  return 'bg-muted text-muted-foreground'
})

/**
 * A card is interactive (connect/upgrade) unless it is already connected, in
 * which case the toggles and buttons take over.
 */
function handleCardClick() {
  if (!props.eligible) {
    emit('upgrade')
    return
  }
  if (!connection.value) {
    emit('connect')
  }
}

function handleToggle(capability: string, enabled: boolean) {
  if (!props.eligible) {
    emit('upgrade')
    return
  }
  emit('toggle', capability, enabled)
}

/**
 * Whether a given toggle is usable. It takes an eligible plan, a live
 * connection, and a connection the user is allowed to manage.
 */
const togglesEnabled = computed(
  () => props.eligible && isConnected.value && (connection.value?.can_manage ?? false),
)

function syncModeLabel(mode: string): string {
  return mode === 'webhook' ? 'Real-time' : mode === 'scheduled' ? 'Scheduled' : 'On demand'
}
</script>

<template>
  <Card
    class="relative overflow-hidden transition-opacity"
    :class="[
      !eligible ? 'opacity-80 saturate-[0.85]' : '',
      !connection && eligible ? 'cursor-pointer hover:border-primary/40' : '',
      !eligible ? 'cursor-pointer' : '',
    ]"
    role="button"
    tabindex="0"
    @click="handleCardClick"
    @keydown.enter.prevent="handleCardClick"
  >
    <!-- Locked corner ribbon for plans without add-ons -->
    <div
      v-if="!eligible"
      class="absolute right-0 top-0 flex items-center gap-1 rounded-bl-lg bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground"
    >
      <LockIcon class="size-3" />
      Pro
    </div>

    <CardHeader class="pb-3">
      <div class="flex items-start gap-3">
        <ProviderLogo :provider="provider.provider" />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <CardTitle class="text-base">{{ provider.name }}</CardTitle>
            <Badge :class="statusStyles">{{ statusLabel }}</Badge>
          </div>
          <CardDescription class="mt-1">{{ provider.description }}</CardDescription>
          <p
            v-if="isConnected && connection?.account_email"
            class="mt-1 truncate text-xs text-muted-foreground"
          >
            {{ connection.account_name ?? connection.account_email }}
            <span v-if="connection.connection_scope === 'firm_wide'" class="ml-1 text-muted-foreground/70">· firm-wide</span>
          </p>
        </div>
      </div>
    </CardHeader>

    <CardContent class="space-y-1 pt-0">
      <!-- Reauthorization banner -->
      <div
        v-if="needsReauth"
        class="mb-2 flex items-center justify-between gap-3 rounded-lg border border-espresso/30 bg-espresso/5 px-3 py-2 dark:border-peach/30 dark:bg-peach/5"
      >
        <div class="flex items-center gap-2 text-sm">
          <AlertTriangleIcon class="size-4 shrink-0 text-espresso dark:text-peach" />
          <span>The provider no longer accepts this connection.</span>
        </div>
        <Button size="sm" variant="outline" :disabled="busy" @click.stop="emit('reauthorize')">
          <RefreshCcwIcon class="size-3.5" />
          Reauthorize
        </Button>
      </div>

      <!-- Paused notice -->
      <p
        v-else-if="isPaused"
        class="mb-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
      >
        Paused because your plan no longer includes add-ons. Your settings are kept — upgrade to
        pick up where you left off.
      </p>

      <!-- Capability toggles -->
      <div
        v-for="capability in provider.capabilities"
        :key="capability.key"
        class="flex items-start justify-between gap-4 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/40"
      >
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <p class="text-sm font-medium leading-tight">{{ capability.label }}</p>
            <span class="text-[10px] uppercase tracking-wide text-muted-foreground/60">
              {{ syncModeLabel(capability.sync_mode) }}
            </span>
          </div>
          <p class="mt-0.5 text-xs text-muted-foreground">{{ capability.description }}</p>

          <!-- Sync status for a live, enabled capability -->
          <div
            v-if="isConnected && capability.state.effectively_enabled"
            class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground"
          >
            <span v-if="capability.state.sync_status === 'syncing'" class="inline-flex items-center gap-1">
              <Loader2Icon class="size-3 animate-spin" /> Syncing…
            </span>
            <span v-else-if="capability.state.last_synced_at">
              Last synced {{ timeAgo(capability.state.last_synced_at) }}
            </span>
            <span v-else>Not synced yet</span>
            <span
              v-if="capability.state.sync_status === 'error' && capability.state.last_error"
              class="text-destructive"
            >
              · {{ capability.state.last_error }}
            </span>
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-1.5 pt-0.5">
          <LockIcon
            v-if="capability.state.policy === 'forced_on' || capability.state.policy === 'forced_off'"
            class="size-3.5 text-muted-foreground/60"
            :aria-label="capability.state.policy === 'forced_on' ? 'Required by your organization' : 'Disabled by your organization'"
          />
          <Switch
            :model-value="capability.state.effectively_enabled"
            :disabled="!togglesEnabled || capability.state.policy === 'forced_on' || capability.state.policy === 'forced_off'"
            @update:model-value="handleToggle(capability.key, $event)"
            @click.stop
          />
        </div>
      </div>
    </CardContent>

    <CardFooter class="flex items-center justify-between gap-2 border-t pt-3">
      <template v-if="!eligible">
        <Button size="sm" variant="secondary" @click.stop="emit('upgrade')">
          <SparklesIcon class="size-4" />
          Upgrade to connect
        </Button>
      </template>

      <template v-else-if="!connection">
        <Button size="sm" :disabled="busy" @click.stop="emit('connect')">
          <Loader2Icon v-if="busy" class="size-4 animate-spin" />
          <PlugIcon v-else class="size-4" />
          Connect
        </Button>
      </template>

      <template v-else>
        <div class="flex items-center gap-2">
          <Button
            v-if="isConnected && connection?.can_manage"
            size="sm"
            variant="outline"
            :disabled="busy"
            @click.stop="emit('sync')"
          >
            <Loader2Icon v-if="busy" class="size-4 animate-spin" />
            <RefreshCcwIcon v-else class="size-4" />
            Sync now
          </Button>
          <Button
            v-if="connection?.can_manage"
            size="sm"
            variant="ghost"
            class="text-destructive hover:text-destructive"
            :disabled="busy"
            @click.stop="emit('disconnect')"
          >
            <UnplugIcon class="size-4" />
            Disconnect
          </Button>
        </div>
        <p v-if="!connection?.can_manage" class="text-xs text-muted-foreground">
          Managed by a firm admin
        </p>
      </template>
    </CardFooter>
  </Card>
</template>
