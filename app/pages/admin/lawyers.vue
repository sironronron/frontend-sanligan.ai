<script setup lang="ts">
import {
  BanIcon,
  BookOpenCheckIcon,
  CheckCheckIcon,
  FileSearchIcon,
  Loader2Icon,
  RotateCcwIcon,
  SearchIcon,
  ShieldXIcon,
  XIcon,
} from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import { authHeaders } from '~/lib/http'
import type { LawyerProfileData } from '~/types/vetting'

definePageMeta({
  middleware: 'admin',
})

const api = useApi()

const {
  public: { apiBase },
} = useRuntimeConfig()

const profiles = ref<LawyerProfileData[]>([])
const loading = ref(true)
const search = ref('')
const statusFilter = ref('pending')
const busyId = ref<string | null>(null)

const actionDialog = reactive({
  open: false,
  profile: null as LawyerProfileData | null,
  action: 'reject' as 'reject' | 'suspend' | 'revoke',
  reason: '',
})

const TABS = [
  { value: 'pending', label: 'Pending' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'revoked', label: 'Revoked' },
  { value: 'all', label: 'All' },
] as const

const statusTone: Record<string, string> = {
  pending: 'bg-espresso/10 text-espresso dark:bg-cream/10 dark:text-peach',
  verified: 'bg-forest/10 text-forest dark:bg-cream/10 dark:text-peach',
  rejected: 'bg-destructive/10 text-destructive',
  suspended: 'bg-muted text-muted-foreground',
  revoked: 'bg-destructive/10 text-destructive',
}

const statusLabel: Record<string, string> = {
  pending: 'Pending',
  verified: 'Verified',
  rejected: 'Rejected',
  suspended: 'Suspended',
  revoked: 'Revoked',
}

async function loadProfiles() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (statusFilter.value !== 'all') params.set('verification_status', statusFilter.value)
    if (search.value.trim()) params.set('search', search.value.trim())

    const res = await api<{ data: LawyerProfileData[] }>(`/admin/lawyers?${params.toString()}`)
    profiles.value = res.data
  } catch {
    toast.error('Could not load lawyer applications.')
  } finally {
    loading.value = false
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined

function onSearchInput() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => void loadProfiles(), 300)
}

function selectTab(value: string) {
  statusFilter.value = value
  void loadProfiles()
}

async function runAction(profile: LawyerProfileData, path: string, body?: Record<string, unknown>) {
  if (busyId.value) return
  busyId.value = profile.id
  try {
    await api(path, { method: 'POST', body })
    toast.success('Profile updated')
    await loadProfiles()
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not update the profile.')
  } finally {
    busyId.value = null
  }
}

function approve(profile: LawyerProfileData) {
  return runAction(profile, `/admin/lawyers/${profile.id}/approve`)
}

function openReasonDialog(profile: LawyerProfileData, action: 'reject' | 'suspend' | 'revoke') {
  actionDialog.open = true
  actionDialog.profile = profile
  actionDialog.action = action
  actionDialog.reason = ''
}

async function confirmReasonAction() {
  if (!actionDialog.profile) return
  const reason = actionDialog.reason.trim()
  if (!reason) {
    toast.error('A reason is required so the lawyer knows what to fix.')
    return
  }
  const { id } = actionDialog.profile
  const { action } = actionDialog
  actionDialog.open = false
  await runAction(actionDialog.profile, `/admin/lawyers/${id}/${action}`, { reason })
}

function reopen(profile: LawyerProfileData) {
  return runAction(profile, `/admin/lawyers/${profile.id}/reopen`)
}

async function viewDocument(profile: LawyerProfileData, kind: 'id_document' | 'bar_membership_document') {
  try {
    const response = await fetch(`${apiBase}/api/admin/lawyers/${profile.id}/document/${kind}`, {
      headers: await authHeaders(),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  } catch {
    toast.error('Could not open that document.')
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

onMounted(loadProfiles)
</script>

<template>
  <div class="mx-auto w-full max-w-5xl px-4 py-6">
    <AdminNav />

    <PageHeader title="Lawyer verification" description="Review registrations, approve verified lawyers, and manage their standing." />

    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <nav class="surface-inset flex items-center gap-0.5 p-0.5 text-sm" aria-label="Verification status">
        <button
          v-for="tab in TABS"
          :key="tab.value"
          type="button"
          class="inline-flex h-7 shrink-0 items-center rounded-md px-3 text-xs font-medium transition-colors"
          :class="statusFilter === tab.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          @click="selectTab(tab.value)"
        >
          {{ tab.label }}
        </button>
      </nav>

      <div class="relative w-full sm:w-64">
        <SearchIcon class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input v-model="search" class="h-8 pl-9 text-sm" placeholder="Search name, roll no., email…" @input="onSearchInput" />
      </div>
    </div>

    <ListSkeleton v-if="loading" :rows="4" />

    <EmptyState
      v-else-if="profiles.length === 0"
      :icon="FileSearchIcon"
      title="No applications here"
      description="Nothing in this status right now."
    />

    <div v-else class="space-y-2">
      <div v-for="p in profiles" :key="p.id" class="surface-interactive p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p class="text-sm font-medium">{{ p.full_name }}</p>
              <Badge :class="statusTone[p.verification_status] ?? 'bg-muted text-muted-foreground'">
                {{ statusLabel[p.verification_status] ?? p.verification_status }}
              </Badge>
              <Badge v-if="p.is_notary" variant="outline" class="text-muted-foreground">Notary</Badge>
              <Badge v-if="p.available" variant="secondary" class="text-forest dark:text-peach">Available</Badge>
            </div>
            <p class="mt-1 text-xs text-muted-foreground">
              {{ p.user?.email ?? '—' }} · Roll no. {{ p.bar_number }} · {{ p.bar_jurisdiction }}
            </p>
            <p class="mt-1 truncate text-xs text-muted-foreground">
              {{ p.region }} · {{ p.practice_areas.join(', ') || 'General practice' }}
            </p>
            <p v-if="p.verification_reason" class="mt-2 rounded-lg bg-destructive/5 p-2 text-xs text-destructive">
              Reason: {{ p.verification_reason }}
            </p>
          </div>

          <div class="flex shrink-0 flex-wrap items-center gap-1">
            <Button variant="ghost" size="sm" :disabled="!p.has_id_document" @click="viewDocument(p, 'id_document')">
              ID
            </Button>
            <Button variant="ghost" size="sm" :disabled="!p.has_bar_membership_document" @click="viewDocument(p, 'bar_membership_document')">
              Bar cert
            </Button>

            <template v-if="p.verification_status === 'pending'">
              <Button size="sm" class="gap-1.5" :disabled="busyId !== null" @click="approve(p)">
                <Loader2Icon v-if="busyId === p.id" class="size-3.5 animate-spin" />
                <CheckCheckIcon v-else class="size-3.5" />
                Approve
              </Button>
              <Button variant="outline" size="sm" class="gap-1.5 text-destructive" :disabled="busyId !== null" @click="openReasonDialog(p, 'reject')">
                <XIcon class="size-3.5" />
                Reject
              </Button>
            </template>

            <template v-else-if="p.verification_status === 'verified'">
              <Button variant="outline" size="sm" class="gap-1.5" :disabled="busyId !== null" @click="openReasonDialog(p, 'suspend')">
                <BanIcon class="size-3.5" />
                Suspend
              </Button>
              <Button variant="ghost" size="sm" class="gap-1.5 text-destructive" :disabled="busyId !== null" @click="openReasonDialog(p, 'revoke')">
                <ShieldXIcon class="size-3.5" />
                Revoke
              </Button>
            </template>

            <Button
              v-else-if="p.verification_status === 'rejected' || p.verification_status === 'suspended' || p.verification_status === 'revoked'"
              variant="outline"
              size="sm"
              class="gap-1.5"
              :disabled="busyId !== null"
              @click="reopen(p)"
            >
              <RotateCcwIcon class="size-3.5" />
              Reopen
            </Button>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap gap-4 border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
          <span>Applied {{ formatDate(p.created_at) }}</span>
          <span v-if="p.verification_reviewed_at">Reviewed {{ formatDate(p.verification_reviewed_at) }}</span>
          <span v-if="p.notarial_commission_expires_at">Commission till {{ formatDate(p.notarial_commission_expires_at) }}</span>
        </div>
      </div>
    </div>

    <AlertDialog v-model:open="actionDialog.open">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{
              actionDialog.action === 'reject'
                ? 'Reject this application'
                : actionDialog.action === 'suspend'
                  ? 'Suspend this lawyer'
                  : 'Revoke this lawyer'
            }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            The lawyer will be told why. Include what they should fix or what happened.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <Textarea v-model="actionDialog.reason" rows="3" maxlength="1000" placeholder="Reason…" />

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction @click="confirmReasonAction">
            <BookOpenCheckIcon class="size-4" />
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>