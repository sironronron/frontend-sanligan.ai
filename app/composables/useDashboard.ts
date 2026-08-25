import { ref, computed } from 'vue'
import type { DashboardSummary } from '~/types/dashboard'

/**
 * Loads the single `/dashboard/summary` aggregation once and exposes it
 * typed. Every widget on the dashboard page reads from here; if the backend
 * does not yet supply a metric the page hides that tile rather than guessing.
 */
export function useDashboard() {
  const api = useApi()

  const summary = ref<DashboardSummary | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    if (loading.value) return summary.value
    loading.value = true
    error.value = null
    try {
      const res = await api<{ data: DashboardSummary }>('/dashboard/summary')
      summary.value = res.data
    } catch (e: any) {
      // No fabricated fallback: an unreachable summary is an error state with a
      // retry, never a blank page or a guessed number.
      error.value = e?.data?.message ?? 'Could not load your dashboard.'
      summary.value = null
    } finally {
      loading.value = false
    }
    return summary.value
  }

  const ready = computed(() => summary.value !== null)

  return { summary, loading, error, load, ready }
}
