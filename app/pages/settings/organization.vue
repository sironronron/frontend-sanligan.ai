<script setup lang="ts">
import {
  BanIcon,
  Building2Icon,
  GlobeIcon,
  ImageIcon,
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
  middleware: ['auth'],
  layout: 'default',
})

const org = useOrganizationStore()
const auth = useAuthStore()
const billing = useBillingStore()

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

/**
 * The profile form is a local draft rather than a live binding on the store:
 * typing must not rewrite the header above it, and Cancel has to have
 * something to fall back to.
 */
const profile = reactive({ name: '', description: '', website: '' })
const savingProfile = ref(false)
const logoInput = ref<HTMLInputElement | null>(null)
const logoBusy = ref(false)

/** Max upload the API accepts, repeated here so the rejection is instant. */
const MAX_LOGO_BYTES = 2 * 1024 * 1024

function resetProfile() {
  profile.name = org.organization?.name ?? ''
  profile.description = org.organization?.description ?? ''
  profile.website = org.organization?.website ?? ''
}

const profileDirty = computed(() =>
  profile.name !== (org.organization?.name ?? '')
  || profile.description !== (org.organization?.description ?? '')
  || profile.website !== (org.organization?.website ?? ''),
)

const profileValid = computed(() => profile.name.trim().length > 0)

async function handleSaveProfile() {
  if (!profileDirty.value || !profileValid.value || savingProfile.value) return

  savingProfile.value = true
  try {
    await org.updateProfile({
      name: profile.name.trim(),
      description: profile.description,
      website: profile.website,
    })
    // The API normalizes what was typed — a bare host comes back with its
    // scheme — so the draft is refilled from the answer, not from the input.
    resetProfile()
    toast.success('Organization profile saved')
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not save the organization profile')
  } finally {
    savingProfile.value = false
  }
}

async function handleLogoPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  // Cleared straight away so picking the same file twice still fires a change.
  input.value = ''

  if (!file) return

  if (file.size > MAX_LOGO_BYTES) {
    toast.error('That image is over 2 MB. Pick a smaller one.')
    return
  }

  logoBusy.value = true
  try {
    await org.uploadLogo(file)
    toast.success('Logo updated')
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not upload that logo')
  } finally {
    logoBusy.value = false
  }
}

async function handleRemoveLogo() {
  logoBusy.value = true
  try {
    await org.removeLogo()
    toast.success('Logo removed')
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not remove the logo')
  } finally {
    logoBusy.value = false
  }
}

watch(() => org.organization, resetProfile, { immediate: true })

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

/**
 * Plans without seat pricing report purchased/free seats as null. A bare dash
 * reads as "we don't know"; say outright that seats are not part of the plan
 * instead. Used seats stay a real member count regardless.
 */
function seatCountLabel(value: number | null) {
  return seats.value?.purchased === null ? 'Not included' : formatCount(value)
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

/**
 * Whether the plan can hold a team at all. Creating an organization is no
 * longer part of signing up, so this page has two empty states rather than
 * one: a plan that could have a team but has not made one yet, and a plan that
 * cannot. Telling them apart is the difference between offering a button and
 * offering an upgrade.
 */
const canHaveTeam = computed(() => auth.user?.is_admin === true || billing.hasFeature('teams'))

onMounted(async () => {
  await billing.fetchSubscription()

  // A user with no organization is answered with a 404 by design, which is an
  // ordinary state here rather than a failure worth a toast.
  if (!auth.hasOrganization) return

  try {
    await Promise.all([org.fetchOrganization(), org.fetchInvitations()])
  } catch (err: any) {
    toast.error(err?.data?.message ?? 'Could not load your organization')
  }
})
</script>

<template>
  <div class="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
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
              <div class="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10">
                <img
                  v-if="org.organization.logo_url"
                  :src="org.organization.logo_url"
                  :alt="`${org.organization.name} logo`"
                  class="size-full object-cover"
                >
                <Building2Icon v-else class="size-5 text-primary" />
              </div>
              <div class="min-w-0">
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
          <!--
            Shown to everyone, editable below by admins only. A member who
            cannot change the firm's blurb should still be able to read it.
          -->
          <p v-if="org.organization.description" class="text-sm text-muted-foreground">
            {{ org.organization.description }}
          </p>
          <a
            v-if="org.organization.website"
            :href="org.organization.website"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-2 hover:underline"
          >
            <GlobeIcon class="size-3.5" />
            {{ org.organization.website.replace(/^https?:\/\//, '') }}
          </a>

          <div class="grid gap-4 sm:grid-cols-3">
            <div>
              <p class="text-xs uppercase tracking-wide text-muted-foreground">Seats purchased</p>
              <p class="mt-1 text-lg font-semibold">{{ seatCountLabel(seats?.purchased ?? null) }}</p>
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
                {{ seatCountLabel(seats?.free ?? null) }}
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

      <!--
        Editing lives in its own card rather than as inline fields on the
        summary above: the summary is what the firm looks like, and turning it
        into a form would make every member's read-only view look broken.
      -->
      <Card v-if="org.isManager" class="mb-6">
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <Building2Icon class="size-4 text-muted-foreground" />
            Organization profile
          </CardTitle>
          <CardDescription>
            How your firm appears to everyone in the workspace.
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-5">
          <div class="flex items-center gap-4">
            <div class="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/40">
              <img
                v-if="org.organization.logo_url"
                :src="org.organization.logo_url"
                alt="Current logo"
                class="size-full object-cover"
              >
              <ImageIcon v-else class="size-6 text-muted-foreground" />
            </div>
            <div class="min-w-0 flex-1 space-y-2">
              <div class="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" :disabled="logoBusy" @click="logoInput?.click()">
                  <Loader2Icon v-if="logoBusy" class="size-3.5 animate-spin" />
                  {{ org.organization.logo_url ? 'Replace logo' : 'Upload logo' }}
                </Button>
                <Button
                  v-if="org.organization.logo_url"
                  variant="ghost"
                  size="sm"
                  class="text-muted-foreground hover:text-destructive"
                  :disabled="logoBusy"
                  @click="handleRemoveLogo"
                >
                  Remove
                </Button>
              </div>
              <p class="text-xs text-muted-foreground">
                JPEG, PNG, or WebP, up to 2 MB. A square image looks best.
              </p>
            </div>
            <input
              ref="logoInput"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              class="hidden"
              @change="handleLogoPicked"
            >
          </div>

          <div class="space-y-1.5">
            <Label for="org-name">Name</Label>
            <Input id="org-name" v-model="profile.name" placeholder="Acme Law Office" />
          </div>

          <div class="space-y-1.5">
            <Label for="org-description">Description</Label>
            <Textarea
              id="org-description"
              v-model="profile.description"
              rows="3"
              maxlength="2000"
              placeholder="What your firm does, and who it does it for."
            />
          </div>

          <div class="space-y-1.5">
            <Label for="org-website">Website</Label>
            <Input id="org-website" v-model="profile.website" placeholder="acme.test" />
            <p class="text-xs text-muted-foreground">
              You can leave off the https:// — we'll add it.
            </p>
          </div>

          <div class="flex items-center gap-2">
            <Button :disabled="!profileDirty || !profileValid || savingProfile" @click="handleSaveProfile">
              <Loader2Icon v-if="savingProfile" class="size-4 animate-spin" />
              Save changes
            </Button>
            <Button v-if="profileDirty" variant="ghost" :disabled="savingProfile" @click="resetProfile">
              Cancel
            </Button>
            <p v-if="!profileValid" class="text-xs text-destructive">
              An organization needs a name.
            </p>
          </div>
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

    <!--
      No organization yet. Which of the two messages below applies is decided by
      the plan, not by the absence: one is an invitation to create, the other is
      an explanation of why the button is not there.
    -->
    <Card v-else>
      <CardContent class="flex flex-col items-center gap-4 px-6 py-14 text-center">
        <div class="flex size-12 items-center justify-center rounded-xl bg-primary/10">
          <UsersIcon class="size-6 text-primary" />
        </div>

        <div class="max-w-sm space-y-1.5">
          <p class="font-medium">
            {{ canHaveTeam ? 'Work with your colleagues' : 'Teams are on the Firm plan' }}
          </p>
          <p class="text-sm text-muted-foreground">
            {{
              canHaveTeam
                ? 'Create an organization to share cases, documents, and templates with your team. Each seat keeps its own message allowance.'
                : 'Your plan covers a single account. Upgrade to Firm to invite colleagues onto shared matters, with seats you can add as the team grows.'
            }}
          </p>
        </div>

        <Button v-if="canHaveTeam" @click="navigateTo('/organization/setup')">
          Create an organization
        </Button>
        <Button v-else variant="outline" @click="navigateTo('/pricing')">
          Compare plans
        </Button>
      </CardContent>
    </Card>
  </div>
</template>
