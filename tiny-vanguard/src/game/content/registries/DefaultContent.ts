import { BUFF_DEFS } from '../buffs/buffs';
import { CHARACTERS } from '../characters/characters';
import { DEBUFF_DEFS } from '../effects/debuffs';
import { ENEMIES } from '../enemies/enemies';
import { EQUIPMENT_DEFS } from '../equipment/equipment';
import { LEVELS } from '../levels/levels';
import { UPGRADES } from '../upgrades/upgrades';
import { WEAPONS } from '../weapons/weapons';
import { TypedRegistry, type ContentRegistries } from './ContentRegistry';

export function createDefaultRegistries(): ContentRegistries {
  const characters = new TypedRegistry<(typeof CHARACTERS)[number]>();
  const weapons = new TypedRegistry<(typeof WEAPONS)[number]>();
  const enemies = new TypedRegistry<(typeof ENEMIES)[number]>();
  const upgrades = new TypedRegistry<(typeof UPGRADES)[number]>();
  const levels = new TypedRegistry<(typeof LEVELS)[number]>();
  const debuffs = new TypedRegistry<(typeof DEBUFF_DEFS)[number]>();
  const buffs = new TypedRegistry<(typeof BUFF_DEFS)[number]>();
  const equipment = new TypedRegistry<(typeof EQUIPMENT_DEFS)[number]>();

  for (const c of CHARACTERS) characters.register(c);
  for (const w of WEAPONS) weapons.register(w);
  for (const e of ENEMIES) enemies.register(e);
  for (const u of UPGRADES) upgrades.register(u);
  for (const l of LEVELS) levels.register(l);
  for (const d of DEBUFF_DEFS) debuffs.register(d);
  for (const b of BUFF_DEFS) buffs.register(b);
  for (const eq of EQUIPMENT_DEFS) equipment.register(eq);

  return {
    characters,
    weapons,
    enemies,
    upgrades,
    levels,
    debuffs,
    buffs,
    equipment,
    weaponBehaviorIds: new Set([
      'weapon-projectile-auto',
      'weapon-orbit-guard',
      'weapon-nova-pulse',
      'weapon-chain-lightning',
      'weapon-sniper-high-hp',
      'weapon-boomerang-axe',
      'weapon-venom-aura',
      'weapon-seeker-missile',
    ]),
    enemyBehaviorIds: new Set([
      'enemy-chaser',
      'enemy-charger',
      'enemy-ranged',
      'enemy-elite-warden',
      'enemy-boss-king',
    ]),
    objectiveBehaviorIds: new Set(['objective-defeat-boss']),
  };
}
