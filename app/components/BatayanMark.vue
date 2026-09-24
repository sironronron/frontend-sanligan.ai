<script setup lang="ts">
/**
 * The Batayan mark: a lowercase "b" standing on a foundation slab.
 * "Batayan" is Filipino for basis — every answer stands on a legal basis — and
 * the slab echoes the underline the chat uses for citations.
 *
 * Drawn in currentColor so it takes the colour of its container. Pass
 * `slab-class` to colour the slab separately (e.g. `fill-peach` on the forest
 * tile, the brand's signature pairing).
 */
withDefaults(defineProps<{ class?: string; slabClass?: string }>(), { class: '', slabClass: '' })
</script>

<template>
  <svg
    viewBox="3 4 42 42"
    :class="class"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M11 8.2 18 5v32h-7z" />
    <path
      fill-rule="evenodd"
      d="M26.5 16a10.5 10.5 0 1 1 0 21a10.5 10.5 0 1 1 0-21zM26.5 22a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9z"
    />
    <rect x="7" y="41" width="34" height="4" rx="1" :class="slabClass" />
  </svg>
</template>
