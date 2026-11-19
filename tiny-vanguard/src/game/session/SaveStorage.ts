import { APP_CONFIG } from '../../config/appConfig';
import { CHARACTERS } from '../content/characters/characters';
import { parseEnchantId } from '../content/enchants/enchants';
import { EQUIPMENT_DEFS } from '../content/equipment/equipment';
import { MAX_RELIC_RANK, parseGemKey } from '../content/gems/gems';
import {
  CHALLENGE_MODIFIER_MAP,
  type ChallengeModifierId,
} from '../content/modifiers/modifiers';
import { TALENT_MAP } from '../content/talents/talents';
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
    bestEndlessSecByLevel: {},
    victories: 0,
    totalRuns: 0,
    stars: 0,
    totalStarsEarned: 0,
    talents: {},
    selectedCharacterId: 'chibi-knight',
    unlockedCharacters: ['chibi-knight'],
    characterShards: {},
    characterStars: {
      'chibi-knight': 1,
      'storm-ranger': 1,
      'iron-bastion': 1,
    },
    loadoutRelicIds: [],
    loadoutSlotsUnlocked: 1,
    relicRanks: {},
    gemInventory: {},
    relicSockets: {},
    relicEnchants: {},
    activeModifiers: [],
    discoveredRelics: [],
    discoveredEvolvedWeapons: [],
    unlockedAchievements: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

function sanitizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item.length > 0 && !out.includes(item)) {
      out.push(item);
    }
  }
  return out;
}

function sanitizeModifiers(raw: unknown): ChallengeModifierId[] {
  if (!Array.isArray(raw)) return [];
  const out: ChallengeModifierId[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && CHALLENGE_MODIFIER_MAP.has(item)) {
      const id = item as ChallengeModifierId;
      if (!out.includes(id)) out.push(id);
    }
  }
  return out;
}

function sanitizeCharacterId(raw: unknown): string {
  if (typeof raw === 'string' && CHARACTERS.some((c) => c.id === raw)) {
    return raw;
  }
  return 'chibi-knight';
}

function sanitizeUnlockedCharacters(raw: unknown, legacyVictories: number): string[] {
  if (raw === undefined && legacyVictories > 0) {
    return CHARACTERS.map((c) => c.id);
  }
  const out = sanitizeStringArray(raw).filter((id) => CHARACTERS.some((c) => c.id === id));
  if (!out.includes('chibi-knight')) out.unshift('chibi-knight');
  return out;
}

function sanitizeCharacterStars(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {
    'chibi-knight': 1,
    'storm-ranger': 1,
    'iron-bastion': 1,
  };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const ch of CHARACTERS) {
    const v = (raw as Record<string, unknown>)[ch.id];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 1) {
      out[ch.id] = Math.min(5, Math.floor(v));
    }
  }
  return out;
}

function sanitizeLoadoutRelics(raw: unknown, maxSlots: number, discovered: string[]): string[] {
  const validIds = new Set(EQUIPMENT_DEFS.map((e) => e.id));
  const out: string[] = [];
  for (const id of sanitizeStringArray(raw)) {
    if (validIds.has(id) && discovered.includes(id) && out.length < maxSlots) {
      out.push(id);
    }
  }
  return out;
}

function sanitizeRelicRanks(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const validIds = new Set(EQUIPMENT_DEFS.map((e) => e.id));
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!validIds.has(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      out[k] = Math.min(MAX_RELIC_RANK, Math.floor(v));
    }
  }
  return out;
}

function sanitizeGemInventory(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!parseGemKey(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      out[k] = Math.floor(v);
    }
  }
  return out;
}

function sanitizeRelicSockets(raw: unknown): Record<string, string | null> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const validIds = new Set(EQUIPMENT_DEFS.map((e) => e.id));
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!validIds.has(k)) continue;
    if (v === null) {
      out[k] = null;
    } else if (typeof v === 'string' && parseGemKey(v)) {
      out[k] = v;
    }
  }
  return out;
}

function sanitizeRelicEnchants(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const validIds = new Set(EQUIPMENT_DEFS.map((e) => e.id));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!validIds.has(k)) continue;
    const eid = parseEnchantId(v);
    if (eid) {
      out[k] = eid;
    }
  }
  return out;
}

function sanitizeTalentsMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const def = TALENT_MAP.get(k);
    if (!def) continue;
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      out[k] = Math.min(def.maxLevel, Math.floor(v));
    }
  }
  return out;
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
      const legacyVictories =
        typeof parsed.victories === 'number' && Number.isFinite(parsed.victories) && parsed.victories >= 0
          ? Math.floor(parsed.victories)
          : 0;
      const discoveredRelics = sanitizeStringArray(parsed.discoveredRelics);
      const loadoutSlotsUnlocked =
        typeof parsed.loadoutSlotsUnlocked === 'number' &&
        Number.isFinite(parsed.loadoutSlotsUnlocked) &&
        parsed.loadoutSlotsUnlocked >= 2
          ? 2
          : 1;
      const unlockedCharacters = sanitizeUnlockedCharacters(parsed.unlockedCharacters, legacyVictories);
      const rawSelected = sanitizeCharacterId(parsed.selectedCharacterId);
      return {
        bestSurvivalSecByLevel: sanitizeRecordMap(parsed.bestSurvivalSecByLevel),
        bestVictorySecByLevel: sanitizeRecordMap(parsed.bestVictorySecByLevel),
        bestEndlessSecByLevel: sanitizeRecordMap(parsed.bestEndlessSecByLevel),
        victories: legacyVictories,
        totalRuns:
          typeof parsed.totalRuns === 'number' && Number.isFinite(parsed.totalRuns) && parsed.totalRuns >= 0
            ? Math.floor(parsed.totalRuns)
            : 0,
        stars:
          typeof parsed.stars === 'number' && Number.isFinite(parsed.stars) && parsed.stars >= 0
            ? Math.floor(parsed.stars)
            : 0,
        totalStarsEarned:
          typeof parsed.totalStarsEarned === 'number' &&
          Number.isFinite(parsed.totalStarsEarned) &&
          parsed.totalStarsEarned >= 0
            ? Math.floor(parsed.totalStarsEarned)
            : 0,
        talents: sanitizeTalentsMap(parsed.talents),
        selectedCharacterId: unlockedCharacters.includes(rawSelected) ? rawSelected : 'chibi-knight',
        unlockedCharacters,
        characterShards: sanitizeRecordMap(parsed.characterShards),
        characterStars: sanitizeCharacterStars(parsed.characterStars),
        loadoutRelicIds: sanitizeLoadoutRelics(
          parsed.loadoutRelicIds,
          loadoutSlotsUnlocked,
          discoveredRelics
        ),
        loadoutSlotsUnlocked,
        relicRanks: sanitizeRelicRanks(parsed.relicRanks),
        gemInventory: sanitizeGemInventory(parsed.gemInventory),
        relicSockets: sanitizeRelicSockets(parsed.relicSockets),
        relicEnchants: sanitizeRelicEnchants(parsed.relicEnchants),
        activeModifiers: sanitizeModifiers(parsed.activeModifiers),
        discoveredRelics,
        discoveredEvolvedWeapons: sanitizeStringArray(parsed.discoveredEvolvedWeapons),
        unlockedAchievements: sanitizeStringArray(parsed.unlockedAchievements),
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
