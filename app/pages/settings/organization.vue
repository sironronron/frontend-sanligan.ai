<script setup lang="ts">
import {
  BanIcon,
  Building2Icon,
  Loader2Icon,
  MailIcon,
  RotateCcwIcon,
  TrashIcon,
  UserPlusIcon,
  UsersIcon,
} from '@lucide/vue'
import { toast } from '~/components/ui/sonner'
import { useOrganizationStore } from '~/stores/organization'
import type { OrgMember } from '~/stores/organization'

definePageMeta({
  middleware: ['auth', 'organization'],
  layout: 'default',
})

const org = useOrganizationStore()
const auth = useAuthStore()

const inviteEmail = ref('')
const inviting = ref(false)
const busyMemberId = ref<string | null>(null)
const confirmingRemove = ref<string | null>(null)

const loading = computed(() => org.loading && org.organization === null)

const roleLabel: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
}

const roleStyles: Record<string, string> = {
  owner: 'bg-primary/10 text-primary',
  admin: 'bg-espresso/10 text-espresso dark:bg-cream/10 dark:text-peach',
  member: 'bg-muted text-muted-foreground',
}

const statusLabel: Record<string, string> = {
  active: 'Active',
  invited: 'Invited',
  suspended: 'Suspended',
}

const statusStyles: Record<string, string> = {
  active: 'bg-forest/10 text-forest dark:bg-cream/10 dark:text-peach',
  invited: 'bg-espresso/10 text-espresso dark:bg-cream/10 dark:text-peach',
  suspended: 'bg-destructive/10 text-destructive',
}

const initials = (name: string) =>
  String(name)
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

const seats = computed(() => org.organization?.seats)
const noFreeSeats = computed(() => seats.value?.free === 0)
const inviteDisabled = computed(() => inviting.value || noFreeSeats.value)

function formatDate(value: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatCount(value: number | null) {
  return value === null ? '—' : value.toLocaleString()
}

function isSelf(member: OrgMember) {
  return member.id === auth.user?.id
}

async function handleInvite() {
  const email = inviteEmail.value.trim()
  if (!email || inviting.value) return
  inviting.value = true
  try {
    await org.invite(email)
    inviteEmail.value = ''
    toast.success(`Invitation sent to ${email}`)
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not send the invitation')
  } finally {
    inviting.value = false
  }
}

async function handleSuspendToggle(member: OrgMember) {
  busyMemberId.value = member.id
  try {
    if (member.org_status === 'suspended') {
      await org.resumeMember(member.id)
      toast.success(`${member.name} can access the organization again`)
    } else {
      await org.suspendMember(member.id)
      toast.success(`${member.name} was suspended`)
    }
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not update this member')
  } finally {
    busyMemberId.value = null
  }
}

async function handleRemove(member: OrgMember) {
  if (confirmingRemove.value !== member.id) {
    confirmingRemove.value = member.id
    setTimeout(() => {
      if (confirmingRemove.value === member.id) confirmingRemove.value = null
    }, 4000)
    return
  }
  confirmingRemove.value = null
  busyMemberId.value = member.id
  try {
    await org.removeMember(member.id)
    toast.success(`${member.name} was removed from the organization`)
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not remove this member')
  } finally {
    busyMemberId.value = null
  }
}

async function handleRevoke(id: string) {
  try {
    await org.revokeInvitation(id)
    toast.success('Invitation revoked')
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not revoke the invitation')
  }
}

onMounted(async () => {
  try {
    await Promise.all([org.fetchOrganization(), org.fetchInvitations()])
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not load your organization')
  }
})
</script>

<template>
  <div class="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
    <PageHeader
      title="Organization"
      description="Manage your workspace, members, and invitations."
    />

    <div v-if="loading" class="space-y-6">
      <div class="h-36 rounded-xl border bg-muted/20" />
      <div class="h-72 rounded-xl border bg-muted/20" />
    </div>

    <template v-else-if="org.organization">
      <Card class="mb-6">
        <CardHeader>
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-center gap-3">
              <div class="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <Building2Icon class="size-5 text-primary" />
              </div>
              <div>
                <CardTitle>{{ org.organization.name }}</CardTitle>
                <CardDescription>Member since {{ formatDate(org.organization.created_at) }}</CardDescription>
              </div>
            </div>
            <Badge :class="roleStyles[org.organization.role] ?? 'bg-muted text-muted-foreground'">
              {{ roleLabel[org.organization.role] ?? org.organization.role }}
            </Badge>
          </div>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-3">
            <div>
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Seats purchased</p>
              <p class="mt-1 text-lg font-semibold">{{ formatCount(seats?.purchased ?? null) }}</p>
            </div>
            <div>
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Seats used</p>
              <p class="mt-1 text-lg font-semibold">{{ formatCount(seats?.used ?? 0) }}</p>
            </div>
            <div>
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Seats free</p>
              <p
                class="mt-1 text-lg font-semibold"
                :class="noFreeSeats ? 'text-destructive' : ''"
              >
                {{ formatCount(seats?.free ?? null) }}
              </p>
            </div>
          </div>
          <p v-if="noFreeSeats" class="text-sm text-espresso dark:text-peach">
            All seats are taken. You can add more seats from the
            <NuxtLink to="/settings/billing" class="font-medium text-primary underline-offset-2 hover:underline">
              billing page
            </NuxtLink>
            .
          </p>
          <p v-else-if="seats?.purchased === null" class="text-sm text-muted-foreground">
            Seat capacity is tied to your subscription. Choose a plan to invite teammates.
          </p>
        </CardContent>
      </Card>

      <Card class="mb-6">
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <UsersIcon class="size-4 text-muted-foreground" />
            Members
            <span class="text-sm font-normal text-muted-foreground">({{ org.organization.members.length }})</span>
          </CardTitle>
          <CardDescription>Everyone who can use this organization.</CardDescription>
        </CardHeader>
        <CardContent class="space-y-1">
          <div
            v-for="member in org.organization.members"
            :key="member.id"
            class="flex items-center gap-3 rounded-lg px-1 py-2.5"
          >
            <Avatar class="size-9">
              <AvatarFallback class="bg-muted text-xs">{{ initials(member.name) }}</AvatarFallback>
            </Avatar>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <p class="truncate text-sm font-medium">{{ member.name }}</p>
                <Badge variant="secondary" :class="roleStyles[member.org_role]">
                  {{ roleLabel[member.org_role] ?? member.org_role }}
                </Badge>
                <Badge variant="secondary" :class="statusStyles[member.org_status]">
                  {{ statusLabel[member.org_status] ?? member.org_status }}
                </Badge>
              </div>
              <p class="truncate text-xs text-muted-foreground">{{ member.email }}</p>
            </div>
            <div
              v-if="org.isManager && !isSelf(member) && member.org_role !== 'owner'"
              class="flex shrink-0 items-center gap-1"
            >
              <Button
                variant="ghost"
                size="sm"
                :disabled="busyMemberId === member.id"
                @click="handleSuspendToggle(member)"
              >
                <Loader2Icon v-if="busyMemberId === member.id" class="size-3 animate-spin" />
                <BanIcon v-else-if="member.org_status === 'active'" class="size-3" />
                <RotateCcwIcon v-else class="size-3" />
                {{ member.org_status === 'suspended' ? 'Reactivate' : 'Suspend' }}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                :class="confirmingRemove === member.id ? 'text-destructive' : 'text-muted-foreground hover:text-destructive'"
                :disabled="busyMemberId === member.id"
                @click="handleRemove(member)"
              >
                <Loader2Icon v-if="busyMemberId === member.id" class="size-3 animate-spin" />
                <TrashIcon v-else class="size-3" />
                {{ confirmingRemove === member.id ? 'Confirm' : 'Remove' }}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card v-if="org.isManager">
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <MailIcon class="size-4 text-muted-foreground" />
            Invitations
          </CardTitle>
          <CardDescription>Invite teammates by email. Each pending invite reserves a seat.</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="flex flex-col gap-2 sm:flex-row">
            <Input
              v-model="inviteEmail"
              type="email"
              placeholder="teammate@example.com"
              class="sm:max-w-xs"
              :disabled="inviting || noFreeSeats"
              @keydown.enter="handleInvite"
            />
            <Button :disabled="inviteDisabled" @click="handleInvite">
              <Loader2Icon v-if="inviting" class="size-4 animate-spin" />
              <UserPlusIcon v-else class="size-4" />
              Send invitation
            </Button>
          </div>
          <p v-if="noFreeSeats" class="text-sm text-destructive">
            No free seats. Add seats from the
            <NuxtLink to="/settings/billing" class="font-medium underline-offset-2 hover:underline">
              billing page
            </NuxtLink>
            to invite more members.
          </p>

          <div v-if="org.invitations.length > 0" class="space-y-1">
            <div
              v-for="inv in org.invitations"
              :key="inv.id"
              class="flex items-center gap-3 rounded-lg px-1 py-2.5"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{{ inv.email }}</p>
                <p class="truncate text-xs text-muted-foreground">
                  Invited by {{ inv.invited_by?.name ?? 'an admin' }} · {{ formatDate(inv.created_at) }}
                </p>
              </div>
              <Badge
                v-if="inv.status !== 'pending'"
                variant="secondary"
                :class="inv.status === 'revoked' || inv.status === 'expired' ? 'bg-destructive/10 text-destructive' : 'bg-forest/10 text-forest dark:bg-cream/10 dark:text-peach'"
              >
                {{ inv.status === 'accepted' ? 'Accepted' : inv.status === 'revoked' ? 'Revoked' : 'Expired' }}
              </Badge>
              <Button v-else variant="ghost" size="sm" class="text-muted-foreground hover:text-destructive" @click="handleRevoke(inv.id)">
                Revoke
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>
