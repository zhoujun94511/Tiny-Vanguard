import type { EquipmentDefinition } from '../definitions/ContentTypes';

export const WEAPON_ICONS: Readonly<Record<string, string>> = {
  'star-blaster': '✨',
  'orbit-shields': '🛡️',
  'frost-nova': '❄️',
  'thunder-arc': '⚡',
  'rail-sniper': '🎯',
  'boomerang-axe': '🪓',
  'venom-aura': '☠️',
  'seeker-missile': '🚀',
};

export const RELIC_ICONS: Readonly<Record<string, string>> = {
  'eq-iron-gauntlets': '🥊',
  'eq-swift-gloves': '🧤',
  'eq-wind-boots': '🥾',
  'eq-titan-belt': '🎗️',
  'eq-buckler-crest': '🔰',
  'eq-hunter-lens': '🔍',
  'eq-crimson-fang': '🦷',
  'eq-vampiric-chalice': '🍷',
  'eq-frost-ring': '💍',
  'eq-ember-cloak': '🧥',
  'eq-venom-vial': '🧪',
  'eq-sunder-hammer': '🔨',
  'eq-storm-amulet': '🧿',
  'eq-holy-relic': '✝️',
  'eq-gravity-core': '🌀',
  'eq-executioner-blade': '🗡️',
  'eq-arcane-codex': '📘',
  'eq-sunflare-badge': '☀️',
  'eq-fury-reactor': '⚛️',
  'eq-pierce-quiver': '🏹',
};

export const WEAPON_ZH_NAMES: Readonly<Record<string, string>> = {
  'star-blaster': '星辉连弹',
  'orbit-shields': '守护星环',
  'frost-nova': '寒霜震荡波',
  'thunder-arc': '雷鸣链刃',
  'rail-sniper': '星轨重狙',
  'boomerang-axe': '回旋战斧',
  'venom-aura': '毒雾力场',
  'seeker-missile': '追踪飞弹',
};

export function getWeaponZhName(weaponId: string): string {
  return WEAPON_ZH_NAMES[weaponId] ?? weaponId;
}

export function getWeaponIcon(weaponId: string): string {
  return WEAPON_ICONS[weaponId] ?? '⚔️';
}

export function getRelicIcon(relicId: string): string {
  return RELIC_ICONS[relicId] ?? '🏅';
}

export function getRelicTierClass(tier: EquipmentDefinition['tier']): string {
  if (tier === 'legendary') return 'tier-legendary';
  if (tier === 'epic') return 'tier-epic';
  if (tier === 'rare') return 'tier-rare';
  if (tier === 'uncommon') return 'tier-uncommon';
  return 'tier-common';
}
