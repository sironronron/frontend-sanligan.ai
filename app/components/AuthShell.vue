<script setup lang="ts">
import { BookOpenIcon, FolderOpenIcon, MoonIcon, ScaleIcon, SunIcon } from '@lucide/vue'

defineProps<{
  title: string
  subtitle: string
}>()

const { isDark, toggle: toggleTheme } = useTheme()

const highlights = [
  {
    icon: ScaleIcon,
    title: 'Research with the sources in view',
    body: 'Every answer lists the authorities it drew on, so you can open them and check.',
  },
  {
    icon: BookOpenIcon,
    title: 'Draft from your own templates',
    body: 'Generate pleadings and letters from templates your firm already uses.',
  },
  {
    icon: FolderOpenIcon,
    title: 'Keep a matter together',
    body: 'Cases, documents, and tasks stay in one place instead of scattered across threads.',
  },
]
</script>

<template>
  <div class="flex flex-1 flex-col lg:flex-row">
    <!--
      Brand panel. Hidden below lg, where the form is the entire page — a
      marketing column above a login form is just something to scroll past.
    -->
    <aside class="relative hidden overflow-hidden bg-forest px-12 py-14 text-cream lg:flex lg:w-[46%] lg:flex-col xl:px-16">
      <div aria-hidden="true" class="pointer-events-none absolute -right-28 -top-28 size-80 rounded-full bg-peach/10 blur-3xl" />
      <div aria-hidden="true" class="pointer-events-none absolute -bottom-32 -left-24 size-96 rounded-full bg-peach/[0.07] blur-3xl" />

      <NuxtLink to="/" class="relative flex w-fit items-center gap-2.5 font-heading text-lg font-semibold tracking-tight">
        <span class="size-2.5 rounded-full bg-peach" />
        Batayan
      </NuxtLink>

      <div class="relative my-auto max-w-md py-12">
        <h2 class="font-heading text-4xl leading-[1.15] tracking-tight xl:text-[2.75rem]">
          Philippine legal research, with its sources in view.
        </h2>

        <ul class="mt-10 space-y-6">
          <li v-for="item in highlights" :key="item.title" class="flex gap-4">
            <span class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-cream/10 text-peach">
              <component :is="item.icon" class="size-4.5" />
            </span>
            <div class="min-w-0">
              <p class="text-sm font-semibold">{{ item.title }}</p>
              <p class="mt-1 text-sm leading-relaxed text-cream/70">{{ item.body }}</p>
            </div>
          </li>
        </ul>
      </div>

      <p class="relative max-w-md border-t border-cream/15 pt-6 text-xs leading-relaxed text-cream/60">
        Batayan is an AI assistant, not a lawyer. Verify every authority against its
        primary source before you rely on it.
      </p>
    </aside>

    <main class="flex flex-1 flex-col px-5 py-6 sm:px-8">
      <div class="flex items-center justify-between lg:justify-end">
        <NuxtLink to="/" class="flex items-center gap-2 font-heading font-semibold tracking-tight lg:hidden">
          <span class="size-2.5 rounded-full bg-primary" />
          Batayan
        </NuxtLink>
        <button
          type="button"
          aria-label="Toggle theme"
          class="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          @click="toggleTheme"
        >
          <component :is="isDark ? SunIcon : MoonIcon" class="size-4" />
        </button>
      </div>

      <div class="flex flex-1 items-center justify-center py-8">
        <div class="w-full max-w-[24rem]">
          <h1 class="text-[1.75rem] font-semibold leading-tight tracking-tight">{{ title }}</h1>
          <p class="mt-2 text-sm leading-relaxed text-muted-foreground">{{ subtitle }}</p>

          <div class="mt-8">
            <slot />
          </div>

          <div v-if="$slots.footer" class="mt-8 border-t pt-6 text-center text-sm text-muted-foreground">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
