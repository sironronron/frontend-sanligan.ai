<script setup lang="ts">
definePageMeta({
  layout: 'bare',
  middleware: ['auth'],
})

const auth = useAuthStore()

const steps = [
  { title: 'Batayan', phrase: 'Preparing your legal workspace' },
  { title: 'Batayan', phrase: 'Setting up your document library' },
  { title: 'Batayan', phrase: 'Configuring your practice areas' },
  { title: 'Batayan', phrase: 'Initializing your case files' },
  { title: 'Batayan', phrase: 'Personalizing your experience' },
] as const

const currentStep = ref(0)
const destination = ref<string | null>(null)
const completed = ref(false)

const currentTitle = computed(() => steps[currentStep.value]?.title ?? 'Batayan')
const currentPhrase = computed(() => steps[currentStep.value]?.phrase ?? 'Preparing')

onMounted(() => {
  const route = useRoute()
  destination.value = (route.query.next as string) || auth.homePath()

  const interval = setInterval(() => {
    if (currentStep.value < steps.length - 1) {
      currentStep.value++
    }
  }, 1600)

  setTimeout(() => {
    clearInterval(interval)
    completed.value = true
    setTimeout(() => {
      if (destination.value) {
        navigateTo(destination.value)
      }
    }, 600)
  }, 8500)
})
</script>

<template>
  <div class="preparing-page">
    <div class="preparing-content">
      <!-- Pulsing ring -->
      <div class="pulse-container">
        <div class="pulse-ring"></div>
        <div class="pulse-ring delay-1"></div>
        <div class="pulse-ring delay-2"></div>
        <div class="dot"></div>
      </div>

      <!-- Title -->
      <Transition name="title-fade" mode="out-in">
        <h1 :key="currentStep" class="preparing-title">
          {{ currentTitle }}
        </h1>
      </Transition>

      <!-- Description -->
      <Transition name="phrase-slide" mode="out-in">
        <p :key="currentStep" class="preparing-phrase">
          {{ currentPhrase }}...
        </p>
      </Transition>

      <!-- Progress bar -->
      <div class="progress-bar">
        <div class="progress-fill"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preparing-page {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  z-index: 50;
}

.preparing-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

/* Pulse animation */
.pulse-container {
  position: relative;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent-primary);
  position: relative;
  z-index: 1;
}

.pulse-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid var(--accent-primary);
  opacity: 0;
  animation: pulse-expand 2s ease-out infinite;
}

.pulse-ring.delay-1 {
  animation-delay: 0.6s;
}

.pulse-ring.delay-2 {
  animation-delay: 1.2s;
}

@keyframes pulse-expand {
  0% {
    transform: scale(0.5);
    opacity: 0.6;
  }
  100% {
    transform: scale(2);
    opacity: 0;
  }
}

/* Title */
.preparing-title {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.03em;
}

/* Phrase */
.preparing-phrase {
  font-size: 1rem;
  color: var(--text-secondary);
  text-align: center;
}

/* Transitions */
.title-fade-enter-active,
.title-fade-leave-active {
  transition: all 0.3s ease;
}

.title-fade-enter-from {
  opacity: 0;
  transform: scale(0.95);
}

.title-fade-leave-to {
  opacity: 0;
  transform: scale(1.05);
}

.phrase-slide-enter-active,
.phrase-slide-leave-active {
  transition: all 0.3s ease;
}

.phrase-slide-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.phrase-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* Progress bar */
.progress-bar {
  width: 200px;
  height: 3px;
  background: var(--border-primary);
  border-radius: 9999px;
  overflow: hidden;
  margin-top: 1rem;
}

.progress-fill {
  width: 100%;
  height: 100%;
  background: var(--accent-primary);
  border-radius: 9999px;
  animation: progress-animate 8.5s ease-in-out forwards;
}

@keyframes progress-animate {
  0% {
    width: 0%;
  }
  100% {
    width: 100%;
  }
}
</style>
