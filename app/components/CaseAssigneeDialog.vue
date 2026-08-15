<script setup lang="ts">
import {
  CrownIcon,
  Loader2Icon,
  MailPlusIcon,
  SearchIcon,
  UserPlusIcon,
  UsersIcon,
  XIcon,
} from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import { useCaseStore, type CaseMember } from '~/stores/cases'
import { useAuthStore } from '~/stores/auth'

/**
 * Who is working this case.
 *
 * One field does both jobs: type to filter colleagues, and if what you typed is
 * an email nobody in the firm has, the same box offers to invite them. Asking
 * the user to choose "assign" or "invite" up front makes them answer a question
 * about the firm's membership they should not have to hold in their head.
 */
const props = defineProps<{
  caseId: string
  owner?: CaseMember | null
  assignees?: CaseMember[]
  /** False for a solo account or a case in another firm — the dialog reads only. */
  canManage: boolean
  /** True once the case is closed or archived: the roster is frozen, not editable. */
  readonly?: boolean
}>()

const emit = defineEmits<{ close: [] }>()

const caseStore = useCaseStore()
const auth = useAuthStore()

const candidates = ref<CaseMember[]>([])
const loading = ref(false)
const query = ref('')
/** The member id, or the literal 'invite', currently mid-request. */
const busy = ref<string | null>(null)

const assignees = computed(() => props.assignees ?? [])

/**
 * The right to change the roster, not merely to see it. A closed or archived
 * matter keeps its record of who worked it — reopen the case to change it.
 */
const canEdit = computed(() => props.canManage && !props.readonly)

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (needle === '') return candidates.value

  return candidates.value.filter(
    (c) => c.name.toLowerCase().includes(needle) || c.email.toLowerCase().includes(needle),
  )
})

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Offer the invite row only when the box holds a real address that matched
 * nobody — an invite is a heavier action than an assignment, and it should not
 * sit there tempting someone who is still halfway through typing a name.
 */
const inviteEmail = computed(() => {
  const value = query.value.trim().toLowerCase()
  if (!EMAIL.test(value)) return null
  if (filtered.value.length > 0) return null
  if (assignees.value.some((a) => a.email.toLowerCase() === value)) return null
  if (props.owner?.email.toLowerCase() === value) return null

  return value
})

/** Only org admins may send invites; a plain owner can still assign colleagues. */
const canInvite = computed(() => auth.user?.org_role === 'owner' || auth.user?.org_role === 'admin')

async function loadCandidates() {
  if (!canEdit.value) return

  loading.value = true
  try {
    candidates.value = await caseStore.fetchAssignableMembers(props.caseId)
  } catch {
    candidates.value = []
  } finally {
    loading.value = false
  }
}

async function assign(member: CaseMember) {
  busy.value = member.id
  try {
    await caseStore.assignMember(props.caseId, { user_id: member.id })
    toast.success(`${member.name} is now on this case`)
    query.value = ''
    await loadCandidates()
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not assign that colleague')
  } finally {
    busy.value = null
  }
}

async function invite() {
  const email = inviteEmail.value
  if (!email) return

  busy.value = 'invite'
  try {
    const response = await caseStore.assignMember(props.caseId, { email })

    // The API answers either way: an address that turned out to be a colleague
    // is assigned outright, anything else gets an invite carrying this case.
    toast.success(
      response.invitation
        ? `Invited ${email}. They'll join this case when they accept.`
        : `${email} is now on this case`,
    )

    query.value = ''
    await loadCandidates()
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not send that invitation')
  } finally {
    busy.value = null
  }
}

async function remove(member: CaseMember) {
  busy.value = member.id
  try {
    await caseStore.unassignMember(props.caseId, member.id)
    toast.success(`${member.name} was taken off this case`)
    await loadCandidates()
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not remove that colleague')
  } finally {
    busy.value = null
  }
}

function initials(name: string) {
  return name.split(/\s+/).map((p) => p[0] ?? '').join('').slice(0, 2).toUpperCase()
}

onMounted(loadCandidates)
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[120] flex items-center justify-center p-4 backdrop-blur-sm"
      style="background: rgb(0 0 0 / 0.45)"
      role="dialog"
      aria-modal="true"
      aria-label="People on this case"
      @click.self="emit('close')"
    >
      <div class="surface flex max-h-[86dvh] w-full max-w-lg flex-col overflow-hidden">
        <div class="flex items-start gap-3 border-b px-5 py-3.5">
          <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <UsersIcon class="size-4 text-primary" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">People on this case</p>
            <p class="mt-0.5 text-xs text-muted-foreground">
              {{
                readonly
                  ? 'This case is closed or archived. Its roster is kept as a record — reopen the case to change who is on it.'
                  : canManage
                    ? 'Assigned colleagues can read the matter and work it — message it, attach documents, and move its status.'
                    : 'Only the case owner or a firm admin can change who is on this case.'
              }}
            </p>
          </div>
          <Button variant="ghost" size="icon" class="size-7 shrink-0" aria-label="Close" @click="emit('close')">
            <XIcon class="size-4" />
          </Button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <!-- Current -->
          <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            On the case
          </p>

          <div class="mt-2 space-y-1">
            <div v-if="owner" class="flex items-center gap-3 rounded-lg px-1 py-2">
              <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground">
                {{ initials(owner.name) }}
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{{ owner.name }}</p>
                <p class="truncate text-xs text-muted-foreground">{{ owner.email }}</p>
              </div>
              <Badge variant="secondary" class="shrink-0 gap-1 text-[10px]">
                <CrownIcon class="size-3" />
                Owner
              </Badge>
            </div>

            <div
              v-for="member in assignees"
              :key="member.id"
              class="group flex items-center gap-3 rounded-lg px-1 py-2"
            >
              <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
                {{ initials(member.name) }}
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{{ member.name }}</p>
                <p class="truncate text-xs text-muted-foreground">{{ member.email }}</p>
              </div>

              <!--
                Anyone on the case can take themselves off it, even without the
                right to manage everyone else.
              -->
              <Button
                v-if="!readonly && (canManage || member.id === auth.user?.id)"
                variant="ghost"
                size="sm"
                class="shrink-0 text-muted-foreground hover:text-destructive"
                :disabled="busy === member.id"
                @click="remove(member)"
              >
                <Loader2Icon v-if="busy === member.id" class="size-3.5 animate-spin" />
                <span v-else>{{ member.id === auth.user?.id ? 'Leave' : 'Remove' }}</span>
              </Button>
            </div>

            <p v-if="assignees.length === 0" class="px-1 py-2 text-xs text-muted-foreground">
              Nobody else is on this case yet.
            </p>
          </div>

          <!-- Add -->
          <template v-if="canEdit">
            <div class="my-4 h-px bg-border" />

            <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Add someone
            </p>

            <div class="relative mt-2">
              <SearchIcon class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                v-model="query"
                class="h-9 pl-9 text-sm"
                placeholder="Search colleagues, or type an email to invite…"
              />
            </div>

            <div v-if="loading" class="mt-3 space-y-2">
              <Skeleton v-for="i in 3" :key="i" class="h-11 w-full rounded-lg" />
            </div>

            <div v-else class="mt-2 space-y-1">
              <button
                v-for="member in filtered"
                :key="member.id"
                type="button"
                class="flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left transition-colors hover:bg-muted"
                :disabled="busy === member.id"
                @click="assign(member)"
              >
                <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
                  {{ initials(member.name) }}
                </span>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium">{{ member.name }}</p>
                  <p class="truncate text-xs text-muted-foreground">{{ member.email }}</p>
                </div>
                <Loader2Icon v-if="busy === member.id" class="size-4 shrink-0 animate-spin text-muted-foreground" />
                <UserPlusIcon v-else class="size-4 shrink-0 text-muted-foreground" />
              </button>

              <!-- An address that matched nobody: offer the invite. -->
              <button
                v-if="inviteEmail && canInvite"
                type="button"
                class="flex w-full items-center gap-3 rounded-lg px-1 py-2 text-left transition-colors hover:bg-muted"
                :disabled="busy === 'invite'"
                @click="invite"
              >
                <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <MailPlusIcon class="size-4 text-primary" />
                </span>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-medium">Invite {{ inviteEmail }}</p>
                  <p class="truncate text-xs text-muted-foreground">
                    Uses a seat on your plan. They join this case when they accept.
                  </p>
                </div>
                <Loader2Icon v-if="busy === 'invite'" class="size-4 shrink-0 animate-spin text-muted-foreground" />
              </button>

              <p
                v-if="inviteEmail && !canInvite"
                class="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground"
              >
                {{ inviteEmail }} isn't in your organization yet. Only a firm owner or admin can send
                an invitation.
              </p>

              <p
                v-else-if="filtered.length === 0 && !inviteEmail"
                class="px-1 py-2 text-xs text-muted-foreground"
              >
                {{
                  query.trim()
                    ? 'No colleague matches that. Type a full email address to invite someone new.'
                    : 'Everyone in your organization is already on this case.'
                }}
              </p>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
