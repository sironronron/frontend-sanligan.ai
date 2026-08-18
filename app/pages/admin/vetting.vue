<script setup lang="ts">
import {
  BanknoteIcon,
  CheckCheckIcon,
  CircleDollarSignIcon,
  Loader2Icon,
  SaveIcon,
} from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import type { LawyerProfileData } from '~/types/vetting'

definePageMeta({
  middleware: 'admin',
})

const api = useApi()

interface SettingsData {
  fees: { notarization_fee: number, vetting_fee: number, overrides?: Record<string, number> }
  rules: {
    commission_percent: number
    escalation_hours: number
    max_concurrent_assignments: number
    match_pool_size: number
  }
}

interface SummaryData {
  requests: {
    total: number
    open: number
    in_progress: number
    completed: number
    cancelled: number
    declined: number
  }
  acceptance_rate: number
  avg_turnaround_hours: number | null
  revenue: { notarization: number, notarization_refunded: number, vetting: number }
  notarization_count: number
}

interface LawyerReportRow {
  profile: LawyerProfileData
  active_requests: number
  accepted_total: number
  completed_total: number
  notarization_count: number
  revenue: number
  platform_fee: number
  lawyer_share: number
}

interface Payout {
  id: string
  lawyer_id: number
  lawyer_name: string | null
  period_start: string
  period_end: string
  gross_amount: number
  platform_fee: number
  lawyer_share: number
  notarization_count: number
  status: string
  payout_ref: string | null
  paid_at: string | null
  created_at: string
}

const settings = ref<SettingsData | null>(null)
const summary = ref<SummaryData | null>(null)
const lawyerRows = ref<LawyerReportRow[]>([])
const payouts = ref<Payout[]>([])
const loadingSettings = ref(true)
const loadingReports = ref(true)
const loadingPayouts = ref(true)
const savingSettings = ref(false)
const markingPaidId = ref<string | null>(null)

const form = reactive({
  notarization_fee: 0,
  vetting_fee: 0,
  commission_percent: 10,
  escalation_hours: 24,
  max_concurrent_assignments: 3,
  match_pool_size: 3,
})

const settingsDirty = computed(() => {
  if (!settings.value) return false
  return form.notarization_fee !== settings.value.fees.notarization_fee
    || form.vetting_fee !== settings.value.fees.vetting_fee
    || form.commission_percent !== settings.value.rules.commission_percent
    || form.escalation_hours !== settings.value.rules.escalation_hours
    || form.max_concurrent_assignments !== settings.value.rules.max_concurrent_assignments
    || form.match_pool_size !== settings.value.rules.match_pool_size
})

function fillSettings(data: SettingsData) {
  form.notarization_fee = data.fees.notarization_fee
  form.vetting_fee = data.fees.vetting_fee
  form.commission_percent = data.rules.commission_percent
  form.escalation_hours = data.rules.escalation_hours
  form.max_concurrent_assignments = data.rules.max_concurrent_assignments
  form.match_pool_size = data.rules.match_pool_size
}

async function loadSettings() {
  loadingSettings.value = true
  try {
    const res = await api<{ data: SettingsData }>('/admin/vetting/settings')
    settings.value = res.data
    fillSettings(res.data)
  } catch {
    toast.error('Could not load vetting settings.')
  } finally {
    loadingSettings.value = false
  }
}

async function saveSettings() {
  if (savingSettings.value || !settingsDirty.value) return
  savingSettings.value = true
  try {
    const res = await api<{ data: SettingsData }>('/admin/vetting/settings', {
      method: 'PUT',
      body: {
        fees: {
          notarization_fee: form.notarization_fee,
          vetting_fee: form.vetting_fee,
        },
        rules: {
          commission_percent: form.commission_percent,
          escalation_hours: form.escalation_hours,
          max_concurrent_assignments: form.max_concurrent_assignments,
          match_pool_size: form.match_pool_size,
        },
      },
    })
    settings.value = res.data
    fillSettings(res.data)
    toast.success('Settings saved')
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not save the settings.')
  } finally {
    savingSettings.value = false
  }
}

async function loadReports() {
  loadingReports.value = true
  try {
    const [summaryRes, lawyersRes] = await Promise.all([
      api<{ data: SummaryData }>('/admin/vetting/reports/summary'),
      api<{ data: LawyerReportRow[] }>('/admin/vetting/reports/lawyers'),
    ])
    summary.value = summaryRes.data
    lawyerRows.value = lawyersRes.data
  } catch {
    toast.error('Could not load the reports.')
  } finally {
    loadingReports.value = false
  }
}

async function loadPayouts() {
  loadingPayouts.value = true
  try {
    const res = await api<{ data: Payout[] }>('/admin/lawyer-payouts')
    payouts.value = res.data
  } catch {
    toast.error('Could not load payouts.')
  } finally {
    loadingPayouts.value = false
  }
}

async function markPaid(payout: Payout) {
  if (markingPaidId.value) return
  markingPaidId.value = payout.id
  try {
    await api(`/admin/lawyer-payouts/${payout.id}/mark-paid`, { method: 'POST' })
    toast.success('Payout marked as paid')
    await loadPayouts()
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not mark this payout paid.')
  } finally {
    markingPaidId.value = null
  }
}

function money(value: number | undefined | null) {
  if (value === undefined || value === null) return '—'
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value / 100)
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

onMounted(() => {
  void loadSettings()
  void loadReports()
  void loadPayouts()
})
</script>

<template>
  <div class="mx-auto w-full max-w-6xl px-4 py-6">
    <AdminNav />

    <PageHeader title="Vetting & payouts" description="Marketplace fees, operational rules, revenue, and weekly notarization payouts." />

    <div class="grid gap-6 lg:grid-cols-2">
      <!-- Settings -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <SaveIcon class="size-4 text-muted-foreground" />
            Marketplace settings
          </CardTitle>
          <CardDescription>Fees are in Philippine pesos; the commission is a percentage of each notarization.</CardDescription>
        </CardHeader>
        <CardContent v-if="loadingSettings">
          <ListSkeleton :rows="3" :icon="false" />
        </CardContent>
        <CardContent v-else class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-1.5">
              <Label for="notarization-fee">Notarization fee (₱)</Label>
              <Input id="notarization-fee" v-model.number="form.notarization_fee" type="number" min="0" step="100" />
            </div>
            <div class="space-y-1.5">
              <Label for="vetting-fee">Vetting fee (₱)</Label>
              <Input id="vetting-fee" v-model.number="form.vetting_fee" type="number" min="0" step="100" />
            </div>
            <div class="space-y-1.5">
              <Label for="commission-percent">Commission (%)</Label>
              <Input id="commission-percent" v-model.number="form.commission_percent" type="number" min="0" max="100" step="0.5" />
            </div>
            <div class="space-y-1.5">
              <Label for="escalation-hours">Escalation (hours)</Label>
              <Input id="escalation-hours" v-model.number="form.escalation_hours" type="number" min="1" max="168" />
            </div>
            <div class="space-y-1.5">
              <Label for="max-concurrent">Max concurrent per lawyer</Label>
              <Input id="max-concurrent" v-model.number="form.max_concurrent_assignments" type="number" min="1" max="50" />
            </div>
            <div class="space-y-1.5">
              <Label for="match-pool">Match pool size</Label>
              <Input id="match-pool" v-model.number="form.match_pool_size" type="number" min="1" max="10" />
            </div>
          </div>

          <Button :disabled="!settingsDirty || savingSettings" @click="saveSettings">
            <Loader2Icon v-if="savingSettings" class="size-4 animate-spin" />
            <CheckCheckIcon v-else class="size-4" />
            Save settings
          </Button>
        </CardContent>
      </Card>

      <!-- Summary -->
      <Card>
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <CircleDollarSignIcon class="size-4 text-muted-foreground" />
            Platform summary
          </CardTitle>
        </CardHeader>
        <CardContent v-if="loadingReports">
          <ListSkeleton :rows="3" :icon="false" />
        </CardContent>
        <CardContent v-else-if="summary" class="grid gap-4 sm:grid-cols-3">
          <div>
            <p class="text-xs uppercase tracking-wide text-muted-foreground">Requests</p>
            <p class="mt-1 text-lg font-semibold">{{ summary.requests.total }}</p>
            <p class="text-xs text-muted-foreground">
              {{ summary.requests.open }} open · {{ summary.requests.in_progress }} in progress
            </p>
          </div>
          <div>
            <p class="text-xs uppercase tracking-wide text-muted-foreground">Acceptance rate</p>
            <p class="mt-1 text-lg font-semibold">{{ summary.acceptance_rate }}%</p>
            <p class="text-xs text-muted-foreground">{{ summary.requests.completed }} completed</p>
          </div>
          <div>
            <p class="text-xs uppercase tracking-wide text-muted-foreground">Notarization revenue</p>
            <p class="mt-1 text-lg font-semibold">{{ money(summary.revenue.notarization) }}</p>
            <p class="text-xs text-muted-foreground">{{ summary.notarization_count }} acts</p>
          </div>
          <div v-if="summary.avg_turnaround_hours !== null">
            <p class="text-xs uppercase tracking-wide text-muted-foreground">Avg turnaround</p>
            <p class="mt-1 text-lg font-semibold">{{ summary.avg_turnaround_hours }} hrs</p>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Per-lawyer report -->
    <Card class="mt-6">
      <CardHeader>
        <CardTitle>Lawyer performance</CardTitle>
      </CardHeader>
      <CardContent>
        <div v-if="loadingReports"><ListSkeleton :rows="3" :icon="false" /></div>
        <div v-else-if="lawyerRows.length === 0" class="py-8 text-center text-sm text-muted-foreground">
          No lawyers on the platform yet.
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th class="pb-2 pr-4 font-medium">Lawyer</th>
                <th class="pb-2 pr-4 font-medium">Active</th>
                <th class="pb-2 pr-4 font-medium">Accepted</th>
                <th class="pb-2 pr-4 font-medium">Completed</th>
                <th class="pb-2 pr-4 font-medium">Notarizations</th>
                <th class="pb-2 pr-4 font-medium">Revenue</th>
                <th class="pb-2 pr-4 font-medium">Platform fee</th>
                <th class="pb-2 font-medium">Lawyer share</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in lawyerRows" :key="row.profile.id" class="border-b border-border/60 last:border-0">
                <td class="py-2.5 pr-4">
                  <p class="font-medium">{{ row.profile.full_name }}</p>
                  <p class="text-xs text-muted-foreground">{{ row.profile.user?.email ?? '' }}</p>
                </td>
                <td class="py-2.5 pr-4">{{ row.active_requests }}</td>
                <td class="py-2.5 pr-4">{{ row.accepted_total }}</td>
                <td class="py-2.5 pr-4">{{ row.completed_total }}</td>
                <td class="py-2.5 pr-4">{{ row.notarization_count }}</td>
                <td class="py-2.5 pr-4">{{ money(row.revenue) }}</td>
                <td class="py-2.5 pr-4">{{ money(row.platform_fee) }}</td>
                <td class="py-2.5">{{ money(row.lawyer_share) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>

    <!-- Payouts -->
    <Card class="mt-6">
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <BanknoteIcon class="size-4 text-muted-foreground" />
          Weekly payouts
        </CardTitle>
        <CardDescription>Generated every Monday for the previous week's captured notarizations.</CardDescription>
      </CardHeader>
      <CardContent>
        <div v-if="loadingPayouts"><ListSkeleton :rows="3" :icon="false" /></div>
        <EmptyState
          v-else-if="payouts.length === 0"
          :icon="BanknoteIcon"
          title="No payouts yet"
          description="Payouts appear after the first week with completed notarizations."
        />
        <div v-else class="space-y-2">
          <div v-for="p in payouts" :key="p.id" class="flex flex-wrap items-center gap-3 rounded-xl border p-3">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium">{{ p.lawyer_name ?? `Lawyer #${p.lawyer_id}` }}</p>
              <p class="mt-0.5 text-xs text-muted-foreground">
                {{ formatDate(p.period_start) }} – {{ formatDate(p.period_end) }} · {{ p.notarization_count }} notarization(s)
              </p>
            </div>
            <div class="text-right">
              <p class="text-sm font-semibold">{{ money(p.lawyer_share) }}</p>
              <p class="text-xs text-muted-foreground">{{ money(p.gross_amount) }} gross</p>
            </div>
            <Badge :class="p.status === 'paid' ? 'bg-forest/10 text-forest dark:bg-cream/10 dark:text-peach' : 'bg-muted text-muted-foreground'">
              {{ p.status === 'paid' ? 'Paid' : 'Pending' }}
            </Badge>
            <Button
              v-if="p.status !== 'paid'"
              variant="outline"
              size="sm"
              :disabled="markingPaidId !== null"
              @click="markPaid(p)"
            >
              <Loader2Icon v-if="markingPaidId === p.id" class="size-3.5 animate-spin" />
              Mark paid
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>