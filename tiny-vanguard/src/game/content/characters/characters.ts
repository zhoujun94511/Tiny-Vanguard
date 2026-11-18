import type { CharacterDefinition } from '../definitions/ContentTypes';

export const CHARACTERS: readonly CharacterDefinition[] = [
  {
    id: 'chibi-knight',
    name: '星辉先锋',
    description: '身穿星辉重甲的机动先锋，擅长在敌潮中高速走位、自动集火与构筑爆发。',
    baseHp: 120,
    baseSpeed: 6.4,
    pickupRadius: 3.2,
    colliderRadius: 0.55,
    startingWeaponId: 'star-blaster',
    primaryColor: 0xffd166,
    accentColor: 0xef476f,
  },
];
