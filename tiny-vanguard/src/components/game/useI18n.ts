import { readonly, ref } from 'vue';
import type { LanguageCode } from '../../game/core/GameTypes';
import {
  formatDurationMMSS,
  translateContent,
  translateUi,
  type ContentTextEntry,
} from '../../game/i18n/i18n';

const currentLang = ref<LanguageCode>('zh');

export function useI18n() {
  const setLanguageState = (lang: LanguageCode) => {
    currentLang.value = lang;
  };

  const t = (key: string, vars?: Record<string, string | number>) =>
    translateUi(currentLang.value, key, vars);

  const tc = (id: string, field: keyof ContentTextEntry, fallback: string) =>
    translateContent(currentLang.value, id, field, fallback);

  return {
    lang: readonly(currentLang),
    setLanguageState,
    t,
    tc,
    formatTime: formatDurationMMSS,
  };
}
