import { useColorMode } from '@vueuse/core'

export function useTheme() {
  const colorMode = useColorMode({
    attribute: 'class',
    modes: {
      light: 'light',
      dark: 'dark',
    },
    storageKey: 'saligan-theme',
  })

  return {
    theme: colorMode,
    toggle: () => (colorMode.value = colorMode.value === 'dark' ? 'light' : 'dark'),
    isDark: computed(() => colorMode.value === 'dark'),
  }
}
