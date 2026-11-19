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
