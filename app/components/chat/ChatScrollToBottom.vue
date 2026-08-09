<script setup lang="ts">
import { ArrowDownIcon } from '@lucide/vue'

const props = defineProps<{ container: HTMLElement | null }>()

const show = ref(false)

function update() {
  const el = props.container
  if (!el) return
  show.value = el.scrollHeight - el.scrollTop - el.clientHeight > 160
}

watch(
  () => props.container,
  (el) => {
    if (el) {
      update()
      el.addEventListener('scroll', update, { passive: true })
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  props.container?.removeEventListener('scroll', update)
})

function scrollToBottom() {
  props.container?.scrollTo({ top: props.container.scrollHeight, behavior: 'smooth' })
}
</script>

<template>
  <Transition name="fade">
    <Button
      v-if="show"
      class="absolute bottom-4 right-4 z-20 size-9 rounded-full shadow-lg"
      size="icon"
      variant="secondary"
      title="Scroll to bottom"
      aria-label="Scroll to bottom"
      @click="scrollToBottom"
    >
      <ArrowDownIcon class="size-4" />
    </Button>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
