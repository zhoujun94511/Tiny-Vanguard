import { APP_CONFIG } from '../../config/appConfig';
import type { GameSettings, LanguageCode, SaveData } from '../core/GameTypes';

function detectDefaultLanguage(): LanguageCode {
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }
  return 'zh';
}

const DEFAULT_SETTINGS: GameSettings = {
  quality: 'medium',
  audioEnabled: true,
  bgmEnabled: true,
  showDamageNumbers: true,
  language: detectDefaultLanguage(),
};

function createDefaultSave(): SaveData {
  return {
    bestSurvivalSecByLevel: {},
    bestVictorySecByLevel: {},
    victories: 0,
    totalRuns: 0,
    settings: { ...DEFAULT_SETTINGS },
  };
}

function sanitizeRecordMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      out[k] = v;
    }
  }
  return out;
}

function sanitizeQuality(raw: unknown): GameSettings['quality'] {
  return raw === 'low' || raw === 'medium' || raw === 'high' ? raw : DEFAULT_SETTINGS.quality;
}

function sanitizeLanguage(raw: unknown): LanguageCode {
  return raw === 'zh' || raw === 'en' ? raw : detectDefaultLanguage();
}

export class SaveStorage {
  private memoryFallback: SaveData | null = null;

  public load(): SaveData {
    if (this.memoryFallback) {
      return structuredClone(this.memoryFallback);
    }
    try {
      const raw = window.localStorage.getItem(APP_CONFIG.storageKey);
      if (!raw) return createDefaultSave();
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return createDefaultSave();
      }
      const rawSettings =
        parsed.settings && typeof parsed.settings === 'object' && !Array.isArray(parsed.settings)
          ? (parsed.settings as Partial<GameSettings>)
          : undefined;
      return {
        bestSurvivalSecByLevel: sanitizeRecordMap(parsed.bestSurvivalSecByLevel),
        bestVictorySecByLevel: sanitizeRecordMap(parsed.bestVictorySecByLevel),
        victories:
          typeof parsed.victories === 'number' && Number.isFinite(parsed.victories) && parsed.victories >= 0
            ? Math.floor(parsed.victories)
            : 0,
        totalRuns:
          typeof parsed.totalRuns === 'number' && Number.isFinite(parsed.totalRuns) && parsed.totalRuns >= 0
            ? Math.floor(parsed.totalRuns)
            : 0,
        settings: {
          quality: sanitizeQuality(rawSettings?.quality),
          audioEnabled:
            typeof rawSettings?.audioEnabled === 'boolean'
              ? rawSettings.audioEnabled
              : DEFAULT_SETTINGS.audioEnabled,
          bgmEnabled:
            typeof rawSettings?.bgmEnabled === 'boolean'
              ? rawSettings.bgmEnabled
              : DEFAULT_SETTINGS.bgmEnabled,
          showDamageNumbers:
            typeof rawSettings?.showDamageNumbers === 'boolean'
              ? rawSettings.showDamageNumbers
              : DEFAULT_SETTINGS.showDamageNumbers,
          language: sanitizeLanguage(rawSettings?.language),
        },
      };
    } catch {
      const fallback = createDefaultSave();
      this.memoryFallback = structuredClone(fallback);
      return fallback;
    }
  }

  public save(data: SaveData): void {
    const copy = structuredClone(data);
    this.memoryFallback = copy;
    try {
      window.localStorage.setItem(APP_CONFIG.storageKey, JSON.stringify(copy));
    } catch {
      // Storage unavailable (e.g. strict file:// or quota exceeded); keep in-memory fallback
    }
  }
}
