<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import type { LevelUpRequest, UpgradeChoiceView } from '../../game/core/GameTypes';
import WeaponSvgIcon from '../common/WeaponSvgIcon.vue';
import { useI18n } from './useI18n';

const props = defineProps<{
  request: LevelUpRequest;
  touchMode?: boolean;
}>();

const emit = defineEmits<{
  (e: 'choose', upgradeId: string): void;
  (e: 'reroll', requestId: number): void;
  (e: 'skip', requestId: number): void;
}>();

const { t, tc } = useI18n();
const submitted = ref(false);

watch(
  () => props.request.requestId,
  () => {
    submitted.value = false;
  }
);

function selectChoice(upgradeId: string) {
  if (submitted.value) return;
  submitted.value = true;
  emit('choose', upgradeId);
}

const WEAPON_PREFIXES = [
  'star-blaster',
  'orbit-shields',
  'frost-nova',
  'thunder-arc',
  'rail-sniper',
  'boomerang-axe',
  'venom-aura',
  'seeker-missile',
] as const;

function resolveChoiceWeaponId(c: UpgradeChoiceView): string | null {
  if (c.category !== 'weapon-unlock' && c.category !== 'weapon-upgrade') return null;
  const id = c.upgradeId.startsWith('unlock-') ? c.upgradeId.slice(7) : c.upgradeId;
  for (const wid of WEAPON_PREFIXES) {
    if (id === wid || id.startsWith(`${wid}-`)) return wid;
  }
  return null;
}

function getChoiceIcon(c: UpgradeChoiceView): string {
  const id = c.upgradeId;
  if (id.includes('thunder')) return '⚡';
  if (id.includes('sniper')) return '🎯';
  if (id.includes('frost')) return '❄️';
  if (id.includes('orbit')) return '🛡️';
  if (id.includes('star-blaster')) return '✨';
  if (id.includes('boomerang')) return '🪓';
  if (id.includes('venom')) return '☠️';
  if (id.includes('seeker')) return '🚀';
  if (id.includes('fire')) return '🔥';
  if (id.includes('plague')) return '☠️';
  if (id.includes('sunder')) return '🔨';
  if (id.includes('crit')) return '🎯';
  if (id.includes('move')) return '💨';
  if (id.includes('fury')) return '☄️';
  if (id.includes('vitality')) return '🛡️';
  if (id.includes('vampiric')) return '🩸';
  if (id.includes('pickup')) return '🧲';
  if (id.includes('heal')) return '💚';
  if (id.includes('attack-speed')) return '🏹';
  return '⚔️';
}

function getCardTierClass(c: UpgradeChoiceView): string {
  if (c.category === 'weapon-unlock') return 'tier-legendary';
  if (c.category === 'weapon-upgrade' && c.maxLevel === 1) return 'tier-evolution';
  if (c.category === 'weapon-upgrade') return 'tier-arcane';
  if (c.category === 'survival') return 'tier-emerald';
  return 'tier-crimson';
}

function starCount(maxLevel: number): number {
  return Math.max(1, Math.min(5, maxLevel));
}

function onKeyDown(e: KeyboardEvent) {
  if (e.repeat) return;
  if ((e.key === '1' || e.code === 'Numpad1') && props.request.choices[0]) {
    selectChoice(props.request.choices[0].upgradeId);
  } else if ((e.key === '2' || e.code === 'Numpad2') && props.request.choices[1]) {
    selectChoice(props.request.choices[1].upgradeId);
  } else if ((e.key === '3' || e.code === 'Numpad3') && props.request.choices[2]) {
    selectChoice(props.request.choices[2].upgradeId);
  } else if (e.code === 'KeyR' && !submitted.value && props.request.rerollsRemaining > 0) {
    emit('reroll', props.request.requestId);
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown);
});
</script>

<template>
  <div class="overlay skill-backdrop">
    <div class="awakening-shell" role="dialog" aria-modal="true" :aria-label="t('upg.title')">
      <!-- Radiant Header Crest -->
      <div class="modal-head">
        <div class="lv-banner">
          <span class="lv-star">★</span>
          <span class="lv-up-pill">{{ t('upg.lvPill', { lv: request.playerLevel }) }}</span>
          <span class="lv-star">★</span>
        </div>
        <h2 class="modal-title">{{ t('upg.title') }}</h2>
        <p class="modal-sub">{{ t(touchMode ? 'upg.subtitleTouch' : 'upg.subtitleDesktop') }}</p>
      </div>

      <!-- 3 Stylized Tarot Skill Cards -->
      <div class="choices-grid">
        <button
          v-for="(c, idx) in request.choices"
          :key="c.upgradeId"
          type="button"
          class="skill-card"
          :class="getCardTierClass(c)"
          :disabled="submitted"
          @click="selectChoice(c.upgradeId)"
        >
          <div class="card-top-ribbon"></div>

          <div class="card-meta-row">
            <span class="choice-badge">{{ t(`upg.badge.${c.category}`) }}</span>
            <span
              v-if="c.currentLevel === 0"
              class="state-tag"
              :class="c.maxLevel === 1 && c.category === 'weapon-upgrade' ? 'evo' : 'new'"
            >
              {{ c.maxLevel === 1 && c.category === 'weapon-upgrade' ? t('upg.evoBadge') : t('upg.newBadge') }}
            </span>
            <span v-else class="state-tag lv">{{ t('upg.nextLv', { lv: c.nextLevel }) }}</span>
          </div>

          <!-- Centered Illuminated Crest Medallion -->
          <div class="crest-stage">
            <div class="crest-aura"></div>
            <div class="crest-frame">
              <WeaponSvgIcon
                v-if="resolveChoiceWeaponId(c)"
                :weapon-id="resolveChoiceWeaponId(c)!"
                :size="24"
              />
              <span v-else class="crest-icon">{{ getChoiceIcon(c) }}</span>
            </div>
          </div>

          <div class="choice-name">{{ tc(c.upgradeId, 'name', c.name) }}</div>
          <p class="choice-desc">{{ tc(c.upgradeId, 'description', c.description) }}</p>

          <!-- Mastery Star Track (Replaces Dev Text Arrow) -->
          <div class="mastery-row" v-if="c.maxLevel <= 5">
            <span
              v-for="s in starCount(c.maxLevel)"
              :key="s"
              class="mastery-star"
              :class="{
                owned: s <= c.currentLevel,
                gaining: s > c.currentLevel && s <= c.nextLevel,
              }"
            >
              ★
            </span>
          </div>

          <div class="card-action-bar" :class="{ centered: touchMode }">
            <span class="pick-label">{{ t('upg.pickCta') }}</span>
            <kbd v-if="!touchMode" class="key-badge">{{ idx + 1 }}</kbd>
          </div>
        </button>
      </div>

      <div class="reroll-bar">
        <button
          type="button"
          class="reroll-btn"
          :disabled="submitted || request.rerollsRemaining <= 0"
          @click="emit('reroll', request.requestId)"
        >
          🎲 {{ t('upg.reroll', { count: request.rerollsRemaining }) }}<template v-if="!touchMode"> [R]</template>
        </button>
        <button
          type="button"
          class="skip-btn"
          :disabled="submitted"
          @click="submitted = true; emit('skip', request.requestId)"
        >
          ⏭️ {{ t('upg.skip') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.skill-backdrop {
  background:
    radial-gradient(circle at 50% 35%, rgba(255, 209, 102, 0.14) 0%, transparent 55%),
    rgba(6, 11, 24, 0.84);
  backdrop-filter: blur(5px);
  animation: backdropIn 0.18s ease-out;
}
.reroll-bar {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 12px;
}
.reroll-btn,
.skip-btn {
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(15, 23, 42, 0.78);
  color: #e2e8f0;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: transform 0.12s ease, border-color 0.12s ease;
}
.reroll-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(251, 191, 36, 0.7);
  color: #fde047;
}
.skip-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(74, 222, 128, 0.7);
  color: #86efac;
}
.reroll-btn:disabled,
.skip-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
@keyframes backdropIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.awakening-shell {
  width: min(820px, 96vw);
  max-height: 92dvh;
  overflow-y: auto;
  padding: 20px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.modal-head {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.lv-banner {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 5px 18px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(245, 158, 11, 0.22), rgba(255, 209, 102, 0.34), rgba(245, 158, 11, 0.22));
  border: 1px solid rgba(255, 209, 102, 0.55);
  box-shadow: 0 0 24px rgba(251, 191, 36, 0.28);
}
.lv-star {
  color: #fde047;
  font-size: 13px;
}
.lv-up-pill {
  color: #fef08a;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.06em;
}
.modal-title {
  margin: 0;
  color: #ffffff;
  font-size: 24px;
  font-weight: 900;
  text-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
}
.modal-sub {
  margin: 0;
  font-size: 12.5px;
  color: #94a3b8;
  font-weight: 600;
}
.choices-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.skill-card {
  position: relative;
  overflow: hidden;
  text-align: center;
  background: linear-gradient(180deg, rgba(26, 39, 66, 0.96) 0%, rgba(15, 23, 42, 0.98) 100%);
  border: 2px solid rgba(255, 255, 255, 0.16);
  border-radius: 20px;
  padding: 16px 16px 14px;
  color: #f8fafc;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.45);
  transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}
.card-top-ribbon {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 5px;
}
.tier-legendary {
  --tier-color: #fbbf24;
  --tier-glow: rgba(251, 191, 36, 0.34);
}
.tier-evolution {
  --tier-color: #e879f9;
  --tier-glow: rgba(232, 121, 249, 0.34);
}
.tier-arcane {
  --tier-color: #38bdf8;
  --tier-glow: rgba(56, 189, 248, 0.32);
}
.tier-emerald {
  --tier-color: #4ade80;
  --tier-glow: rgba(74, 222, 128, 0.3);
}
.tier-crimson {
  --tier-color: #fb7185;
  --tier-glow: rgba(251, 113, 133, 0.3);
}
.skill-card .card-top-ribbon {
  background: var(--tier-color);
}
.skill-card:hover:not(:disabled),
.skill-card:focus-visible {
  transform: translateY(-6px) scale(1.015);
  border-color: var(--tier-color);
  box-shadow: 0 20px 42px rgba(0, 0, 0, 0.6), 0 0 26px var(--tier-glow);
  outline: none;
}
.card-meta-row {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}
.choice-badge {
  font-size: 11px;
  font-weight: 800;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--tier-color);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
.state-tag {
  font-size: 10.5px;
  font-weight: 900;
  padding: 3px 8px;
  border-radius: 6px;
  letter-spacing: 0.04em;
}
.state-tag.new {
  background: linear-gradient(135deg, #fde047, #f59e0b);
  color: #1e293b;
}
.state-tag.evo {
  background: linear-gradient(135deg, #f0abfc, #a855f7);
  color: #ffffff;
}
.state-tag.lv {
  background: rgba(74, 222, 128, 0.2);
  color: #4ade80;
}
.crest-stage {
  position: relative;
  width: 66px;
  height: 66px;
  display: grid;
  place-items: center;
  margin-top: 2px;
}
.crest-aura {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(circle, var(--tier-glow) 0%, transparent 72%);
}
.crest-frame {
  position: relative;
  width: 54px;
  height: 54px;
  border-radius: 16px;
  transform: rotate(45deg);
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.96), rgba(15, 23, 42, 0.98));
  border: 2px solid var(--tier-color);
  display: grid;
  place-items: center;
  box-shadow: 0 0 16px var(--tier-glow);
}
.crest-icon {
  transform: rotate(-45deg);
  font-size: 26px;
  line-height: 1;
}
.choice-name {
  font-size: 16.5px;
  font-weight: 900;
  color: #ffd166;
  line-height: 1.25;
}
.choice-desc {
  margin: 0;
  font-size: 12.5px;
  color: #cbd5e1;
  line-height: 1.5;
  flex: 1;
  min-height: 3.1em;
}
.mastery-row {
  display: flex;
  justify-content: center;
  gap: 5px;
}
.mastery-star {
  font-size: 14px;
  color: rgba(148, 163, 184, 0.35);
}
.mastery-star.owned {
  color: #f59e0b;
}
.mastery-star.gaining {
  color: #4ade80;
  text-shadow: 0 0 8px rgba(74, 222, 128, 0.8);
}
.card-action-bar {
  width: 100%;
  margin-top: 2px;
  padding: 8px 12px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease;
}
.card-action-bar.centered {
  justify-content: center;
}
.skill-card:hover .card-action-bar {
  background: linear-gradient(135deg, #ffd166, #f4a261);
  border-color: #ffd166;
  color: #1e293b;
}
.pick-label {
  font-size: 12.5px;
  font-weight: 800;
}
.key-badge {
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.14);
  font-family: inherit;
  font-size: 11px;
  font-weight: 800;
  display: grid;
  place-items: center;
}
.skill-card:hover .key-badge {
  background: rgba(30, 41, 59, 0.22);
  color: #1e293b;
}
@media (max-width: 680px) {
  .choices-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .skill-card {
    padding: 12px 14px;
    gap: 6px;
  }
  .crest-stage {
    width: 48px;
    height: 48px;
  }
  .crest-frame {
    width: 40px;
    height: 40px;
    border-radius: 12px;
  }
  .crest-icon {
    font-size: 20px;
  }
  .choice-desc {
    min-height: auto;
  }
}
@media (max-height: 520px) {
  .awakening-shell {
    padding: 10px 12px;
    gap: 10px;
  }
  .modal-title {
    font-size: 18px;
  }
  .modal-sub {
    display: none;
  }
  .choices-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .skill-card {
    padding: 10px 10px 8px;
    gap: 6px;
  }
  .crest-stage {
    width: 44px;
    height: 44px;
  }
  .crest-frame {
    width: 36px;
    height: 36px;
    border-radius: 10px;
  }
  .crest-icon {
    font-size: 18px;
  }
  .choice-name {
    font-size: 13.5px;
  }
  .choice-desc {
    font-size: 11px;
    line-height: 1.3;
    min-height: auto;
  }
  .card-action-bar {
    padding: 5px 8px;
  }
  .reroll-bar {
    margin-top: 6px;
    gap: 8px;
  }
  .reroll-btn,
  .skip-btn {
    padding: 5px 12px;
    font-size: 11px;
  }
}
@media (max-height: 440px) {
  .awakening-shell {
    padding: 6px 10px;
    gap: 6px;
  }
  .lv-banner {
    padding: 3px 12px;
  }
  .modal-title {
    font-size: 15px;
  }
  .skill-card {
    padding: 7px 8px 6px;
    gap: 4px;
    border-radius: 14px;
  }
  .crest-stage {
    width: 36px;
    height: 36px;
    margin-top: 0;
  }
  .crest-frame {
    width: 28px;
    height: 28px;
    border-radius: 8px;
  }
  .crest-icon {
    font-size: 15px;
  }
  .choice-name {
    font-size: 12.5px;
  }
  .choice-desc {
    font-size: 10.5px;
    line-height: 1.25;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .card-action-bar {
    padding: 4px 7px;
  }
}
</style>
