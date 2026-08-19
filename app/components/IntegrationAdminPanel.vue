<script setup lang="ts">
import { Building2Icon, Loader2Icon, ScrollTextIcon, UsersIcon } from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import type { IntegrationProvider } from '~/stores/integrations'
import { timeAgo } from '~/utils/time'

const props = defineProps<{
  providers: IntegrationProvider[]
}>()

const store = useIntegrationsStore()

const loading = ref(true)
const savingMode = ref(false)
const savingPolicy = ref<string | null>(null)
const showAudit = ref(false)
const loadingAudit = ref(false)

onMounted(async () => {
  try {
    await store.fetchAdminOverview()
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not load firm integrations')
  } finally {
    loading.value = false
  }
})

const overview = computed(() => store.adminOverview)

/** Every capability across both providers, for the org-wide policy list. */
const allCapabilities = computed(() =>
  props.providers.flatMap(p =>
    p.capabilities.map(c => ({ ...c, providerName: p.name, providerKey: p.provider })),
  ),
)

function policyFor(capability: string): 'forced_on' | 'forced_off' | 'member' {
  return overview.value?.policies?.[capability] ?? 'member'
}

async function handleModeChange(mode: 'per_seat' | 'firm_wide') {
  savingMode.value = true
  try {
    await store.setConnectionMode(mode)
    toast.success(mode === 'firm_wide'
      ? 'Firm-wide connections enabled — an admin connects once for everyone.'
      : 'Per-seat connections enabled — each member connects their own account.')
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not update the connection mode')
  } finally {
    savingMode.value = false
  }
}

async function handlePolicyChange(capability: string, value: 'forced_on' | 'forced_off' | 'member') {
  savingPolicy.value = capability
  try {
    const policies = { ...(overview.value?.policies ?? {}) }
    if (value === 'member') {
      policies[capability] = null as any
    } else {
      policies[capability] = value
    }
    await store.setPolicies(policies)
    await store.fetchAdminOverview()
    toast.success('Capability policy updated')
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not update the policy')
  } finally {
    savingPolicy.value = null
  }
}

async function toggleAudit() {
  showAudit.value = !showAudit.value
  if (showAudit.value && store.auditLogs.length === 0) {
    loadingAudit.value = true
    try {
      await store.fetchAuditLogs()
    } catch (err: any) {
      toast.error(err?.data?.message ?? 'Could not load the audit log')
    } finally {
      loadingAudit.value = false
    }
  }
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    connected: 'Connected',
    reauthorized: 'Reauthorized',
    disconnected: 'Disconnected',
    capability_enabled: 'Capability enabled',
    capability_disabled: 'Capability disabled',
    scopes_granted: 'Scopes granted',
    scopes_revoked: 'Scopes revoked',
    paused_plan_downgrade: 'Paused (plan downgrade)',
    resumed_plan_upgrade: 'Resumed (plan upgrade)',
    token_refresh_failed: 'Token refresh failed',
    sync_failed: 'Sync failed',
    policy_updated: 'Policy updated',
    connection_mode_changed: 'Connection mode changed',
  }
  return labels[action] ?? action
}
</script>

<template>
  <Card>
    <CardHeader>
      <div class="flex items-start justify-between gap-4">
        <div>
          <CardTitle class="flex items-center gap-2">
            <Building2Icon class="size-4 text-muted-foreground" />
            Firm integrations
          </CardTitle>
          <CardDescription>
            Control how your firm connects add-ons and which capabilities are enforced for everyone.
          </CardDescription>
        </div>
      </div>
    </CardHeader>

    <CardContent v-if="loading" class="space-y-3">
      <div class="h-16 rounded-lg border bg-muted/20" />
      <div class="h-32 rounded-lg border bg-muted/20" />
    </CardContent>

    <CardContent v-else class="space-y-6">
      <!-- Connection mode -->
      <div>
        <p class="mb-2 flex items-center gap-1.5 text-sm font-medium">
          <UsersIcon class="size-4 text-muted-foreground" />
          Connection mode
        </p>
        <div class="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            class="rounded-lg border p-3 text-left transition-colors"
            :class="overview?.connection_mode === 'per_seat' ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'"
            :disabled="savingMode"
            @click="handleModeChange('per_seat')"
          >
            <p class="text-sm font-medium">Per seat</p>
            <p class="mt-0.5 text-xs text-muted-foreground">Each member connects their own account.</p>
          </button>
          <button
            type="button"
            class="rounded-lg border p-3 text-left transition-colors"
            :class="overview?.connection_mode === 'firm_wide' ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'"
            :disabled="savingMode"
            @click="handleModeChange('firm_wide')"
          >
            <p class="text-sm font-medium">Firm-wide</p>
            <p class="mt-0.5 text-xs text-muted-foreground">An admin connects once on behalf of the firm.</p>
          </button>
        </div>
        <p v-if="savingMode" class="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2Icon class="size-3 animate-spin" /> Saving…
        </p>
      </div>

      <!-- Org-wide capability policies -->
      <div>
        <p class="mb-2 text-sm font-medium">Capability policies</p>
        <p class="mb-3 text-xs text-muted-foreground">
          Force a capability on or off for every member, or leave it to each person.
        </p>
        <div class="space-y-2">
          <div
            v-for="capability in allCapabilities"
            :key="`${capability.providerKey}-${capability.key}`"
            class="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
          >
            <div class="min-w-0">
              <p class="truncate text-sm">{{ capability.label }}</p>
              <p class="truncate text-xs text-muted-foreground">{{ capability.providerName }}</p>
            </div>
            <div class="flex w-40 shrink-0 items-center gap-2">
              <Loader2Icon v-if="savingPolicy === capability.key" class="size-4 animate-spin text-muted-foreground" />
              <Select
                v-else
                :model-value="policyFor(capability.key)"
                @update:model-value="handlePolicyChange(capability.key, $event as any)"
              >
                <SelectTrigger class="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member's choice</SelectItem>
                  <SelectItem value="forced_on">Always on</SelectItem>
                  <SelectItem value="forced_off">Always off</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <!-- Member connections -->
      <div>
        <p class="mb-2 text-sm font-medium">Who has connected what</p>
        <div v-if="overview?.connections.firm_wide.length" class="mb-3 space-y-1.5">
          <div
            v-for="conn in overview.connections.firm_wide"
            :key="conn.id"
            class="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2"
          >
            <div class="min-w-0">
              <p class="text-sm font-medium">{{ conn.provider_label }} <span class="text-xs font-normal text-muted-foreground">· firm-wide</span></p>
              <p class="truncate text-xs text-muted-foreground">{{ conn.account_email ?? '—' }}</p>
            </div>
            <Badge>{{ conn.status }}</Badge>
          </div>
        </div>
        <div v-if="overview?.connections.members.length" class="overflow-hidden rounded-lg border">
          <table class="w-full text-sm">
            <thead class="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th class="px-3 py-2 font-medium">Member</th>
                <th class="px-3 py-2 font-medium">Integrations</th>
              </tr>
            </thead>
            <tbody class="divide-y">
              <tr v-for="member in overview.connections.members" :key="member.user_id">
                <td class="px-3 py-2">
                  <p class="font-medium">{{ member.name }}</p>
                  <p class="text-xs text-muted-foreground">{{ member.email }}</p>
                </td>
                <td class="px-3 py-2">
                  <div v-if="member.connections.length" class="flex flex-wrap gap-1.5">
                    <Badge
                      v-for="conn in member.connections"
                      :key="conn.id"
                      :class="conn.status === 'connected' ? 'bg-forest/10 text-forest' : 'bg-muted text-muted-foreground'"
                    >
                      {{ conn.provider_label }}
                    </Badge>
                  </div>
                  <span v-else class="text-xs text-muted-foreground">None connected</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="text-sm text-muted-foreground">No members have connected an add-on yet.</p>
      </div>

      <!-- Audit log -->
      <div class="border-t pt-4">
        <button
          type="button"
          class="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          @click="toggleAudit"
        >
          <ScrollTextIcon class="size-4" />
          {{ showAudit ? 'Hide' : 'Show' }} audit log
        </button>
        <div v-if="showAudit" class="mt-3 space-y-2">
          <p v-if="loadingAudit" class="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2Icon class="size-4 animate-spin" /> Loading…
          </p>
          <p v-else-if="store.auditLogs.length === 0" class="text-sm text-muted-foreground">
            No integration events recorded yet.
          </p>
          <div v-else class="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            <div
              v-for="log in store.auditLogs"
              :key="log.id"
              class="rounded-lg border px-3 py-2 text-sm"
            >
              <div class="flex items-center justify-between gap-2">
                <p class="font-medium">{{ actionLabel(log.action) }}</p>
                <span class="shrink-0 text-xs text-muted-foreground">{{ timeAgo(log.created_at) }}</span>
              </div>
              <p class="mt-0.5 text-xs text-muted-foreground">
                <template v-if="log.provider_label">{{ log.provider_label }} · </template>
                <template v-if="log.actor">{{ log.actor.name }} ({{ log.actor.email }})</template>
                <template v-else>System</template>
              </p>
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
