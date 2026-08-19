<script setup lang="ts">
import { Loader2Icon, PuzzleIcon } from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import { useIntegrationsStore } from '~/stores/integrations'
import type { IntegrationProviderKey } from '~/stores/integrations'

definePageMeta({
  middleware: ['auth'],
  layout: 'default',
})

const store = useIntegrationsStore()
const billing = useBillingStore()
const route = useRoute()

const loading = ref(true)
const upgradeOpen = ref(false)
const upgradeProviderName = ref<string | null>(null)
const disconnectTarget = ref<{ key: IntegrationProviderKey; name: string } | null>(null)
const disconnecting = ref(false)
/** Consent round-trips in flight from a capability toggle. */
const pendingConsent = ref(false)

/** Full-screen "connecting to add-ons" animation shown before a redirect. */
const connecting = ref(false)
const connectingProviderName = ref<string | null>(null)

/** A capability toggle pending the user's confirmation before it switches on. */
const confirmToggle = ref<{
  key: IntegrationProviderKey
  capability: string
  enabled: boolean
  providerName: string
  capabilityLabel: string
} | null>(null)

/** Brief theatrical pause so the connecting animation registers before we leave. */
function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

onMounted(async () => {
  await Promise.all([
    store.fetch(),
    billing.fetchSubscription(),
  ])
  loading.value = false

  // The OAuth landing redirects back here with the outcome in the query.
  const status = route.query.integration_status
  if (status) {
    if (status === 'success') {
      toast.success('Integration connected')
      await store.fetch(true)
    } else if (status === 'denied') {
      toast.info('Connection cancelled — the provider was told no.')
    } else if (status === 'error') {
      toast.error('The connection could not be completed. Please try again.')
    }

    // Clean the query so a refresh does not re-toast.
    navigateTo({ path: '/settings/addons', replace: true })
  }
})

/**
 * Send the browser off to the provider's consent screen. The API hands back
 * the URL; the round-trip returns to /api/integrations/callback and lands
 * back on this page.
 */
function goToConsent(authorizeUrl: string) {
  pendingConsent.value = true
  connecting.value = false
  connectingProviderName.value = null
  window.location.href = authorizeUrl
}

async function handleConnect(key: IntegrationProviderKey) {
  if (!store.eligible) {
    openUpgrade(store.provider(key)?.name ?? null)
    return
  }

  // Show the connecting animation, then hand off to the provider after a beat
  // so the user feels the hand-off to the add-on. The pause also gives the
  // redirect (now routed through the API) time to register before we leave.
  connecting.value = true
  connectingProviderName.value = store.provider(key)?.name ?? null
  try {
    const { authorize_url } = await store.connect(key)
    await delay(1500)
    goToConsent(authorize_url)
  } catch (err: any) {
    connecting.value = false
    connectingProviderName.value = null
    handleGatedError(err, key)
  }
}

/**
 * Enabling a capability first asks for confirmation (and, when scopes are
 * missing, will route to Google). Disabling goes straight through.
 */
function handleToggle(key: IntegrationProviderKey, capability: string, enabled: boolean) {
  if (!store.eligible) {
    openUpgrade(store.provider(key)?.name ?? null)
    return
  }

  if (enabled) {
    confirmToggle.value = {
      key,
      capability,
      enabled,
      providerName: store.provider(key)?.name ?? '',
      capabilityLabel: store.provider(key)?.capabilities.find(c => c.key === capability)?.label ?? 'this feature',
    }
    return
  }

  runToggle(key, capability, enabled)
}

/**
 * Perform the toggle. When the answer needs a consent round-trip, the browser
 * is sent to Google (after the connecting animation) — that is the moment the
 * user may not yet be authenticated or we lack the permission.
 */
async function runToggle(key: IntegrationProviderKey, capability: string, enabled: boolean) {
  try {
    const result = await store.toggleCapability(key, capability, enabled)

    if (result.authorization_required && result.authorize_url) {
      toast.info(enabled
        ? 'One more step — approve the extra access this capability needs.'
        : 'Approve the narrowed permissions to finish switching this off.')
      goToConsent(result.authorize_url)
      return
    }

    toast.success(enabled ? 'Capability enabled' : 'Capability disabled')
  } catch (err: any) {
    handleGatedError(err, key)
  }
}

/**
 * The user confirmed an enable. Show the connecting animation, pause briefly,
 * then either complete the toggle or redirect to Google for consent.
 */
async function confirmEnable() {
  const payload = confirmToggle.value
  if (!payload) return
  confirmToggle.value = null

  connecting.value = true
  connectingProviderName.value = payload.providerName
  await delay(1500)

  try {
    await runToggle(payload.key, payload.capability, payload.enabled)
  } finally {
    connecting.value = false
    connectingProviderName.value = null
  }
}

async function handleSync(key: IntegrationProviderKey) {
  try {
    const results = await store.sync(key)
    const failed = Object.values(results).filter(r => !r.ok)
    if (failed.length === 0) {
      toast.success('Sync complete')
    } else {
      toast.warning(`Sync finished with ${failed.length} problem${failed.length === 1 ? '' : 's'}`)
    }
  } catch (err: any) {
    handleGatedError(err, key)
  }
}

async function handleReauthorize(key: IntegrationProviderKey) {
  try {
    const authorizeUrl = await store.reauthorize(key)
    goToConsent(authorizeUrl)
  } catch (err: any) {
    handleGatedError(err, key)
  }
}

function requestDisconnect(key: IntegrationProviderKey, name: string) {
  disconnectTarget.value = { key, name }
}

async function confirmDisconnect() {
  if (!disconnectTarget.value) return
  disconnecting.value = true
  try {
    await store.disconnect(disconnectTarget.value.key)
    toast.success(`${disconnectTarget.value.name} disconnected`)
    disconnectTarget.value = null
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not disconnect the integration')
  } finally {
    disconnecting.value = false
  }
}

function openUpgrade(providerName: string | null) {
  upgradeProviderName.value = providerName
  upgradeOpen.value = true
}

/**
 * The API answers 402 when the plan does not carry add-ons — the same moment
 * the locked card promised. Surface the upgrade dialog instead of a toast.
 */
function handleGatedError(err: any, key: IntegrationProviderKey) {
  if (err?.status === 402 || err?.response?.status === 402 || err?.data?.upgrade_required) {
    openUpgrade(store.provider(key)?.name ?? null)
    return
  }
  toast.error(err?.data?.message ?? 'Something went wrong. Please try again.')
}

const showAdminPanel = computed(() => store.admin?.is_manager === true)
</script>

<template>
  <div class="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
    <PageHeader
      title="Add-ons"
      description="Connect Google Workspace and Microsoft SharePoint, and choose exactly what each one can do."
    />

    <div v-if="loading" class="space-y-4">
      <div class="h-64 rounded-xl border bg-muted/20" />
      <div class="h-64 rounded-xl border bg-muted/20" />
    </div>

    <template v-else>
      <!-- Plan notice for accounts without add-ons -->
      <div
        v-if="!store.eligible"
        class="mb-4 flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3"
      >
        <div class="flex items-center gap-2.5">
          <PuzzleIcon class="size-4 shrink-0 text-primary" />
          <p class="text-sm">
            {{ store.payload?.upgrade_message ?? 'Add-ons are available on the Pro, Firm, and Business plans.' }}
          </p>
        </div>
        <NuxtLink to="/pricing" class="shrink-0">
          <Button size="sm" variant="outline">
            View plans
          </Button>
        </NuxtLink>
      </div>

      <div class="space-y-4">
        <IntegrationCard
          v-for="provider in store.providers"
          :key="provider.provider"
          :provider="provider"
          :eligible="store.eligible"
          :busy="store.busyProvider === provider.provider"
          @connect="handleConnect(provider.provider)"
          @upgrade="openUpgrade(provider.name)"
          @toggle="(capability: string, enabled: boolean) => handleToggle(provider.provider, capability, enabled)"
          @sync="handleSync(provider.provider)"
          @reauthorize="handleReauthorize(provider.provider)"
          @disconnect="requestDisconnect(provider.provider, provider.name)"
        />
      </div>

      <!-- Firm-level controls for organization managers -->
      <div v-if="showAdminPanel" class="mt-6">
        <IntegrationAdminPanel :providers="store.providers" />
      </div>
    </template>

    <!-- Upgrade prompt for locked cards/toggles -->
    <IntegrationUpgradeDialog
      v-model:open="upgradeOpen"
      :provider-name="upgradeProviderName"
    />

    <!-- Connecting-to-add-ons animation -->
    <ConnectingOverlay
      v-if="connecting"
      :provider-name="connectingProviderName"
    />

    <!-- Confirm before switching a capability on -->
    <AlertDialog :open="confirmToggle !== null" @update:open="confirmToggle = $event ? confirmToggle : null">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Enable {{ confirmToggle?.capabilityLabel }}?</AlertDialogTitle>
          <AlertDialogDescription>
            This turns the feature on for your
            {{ confirmToggle?.providerName || 'connected' }} account. If we don't yet have
            permission to access what it needs, you'll be redirected to Google to approve it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button @click="confirmEnable">
            Continue
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Disconnect confirmation -->
    <AlertDialog :open="disconnectTarget !== null" @update:open="disconnectTarget = $event ? disconnectTarget : null">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect {{ disconnectTarget?.name }}?</AlertDialogTitle>
          <AlertDialogDescription>
            This revokes Batayan's access with the provider and removes the stored credentials.
            Your capability choices are kept if you connect again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="disconnecting">Cancel</AlertDialogCancel>
          <Button
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            :disabled="disconnecting"
            @click="confirmDisconnect"
          >
            <Loader2Icon v-if="disconnecting" class="size-4 animate-spin" />
            Disconnect
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
