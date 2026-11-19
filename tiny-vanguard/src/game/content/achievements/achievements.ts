export interface AchievementDefinition {
  readonly id: string;
  readonly icon: string;
  readonly name: string;
  readonly nameEn: string;
  readonly desc: string;
  readonly descEn: string;
  readonly rewardStars: number;
}

export interface SynergyRecipe {
  readonly weaponId: string;
  readonly relicId: string;
  readonly evolvedName: string;
  readonly evolvedNameEn: string;
}

export const SYNERGY_RECIPES: readonly SynergyRecipe[] = [
  { weaponId: 'star-blaster', relicId: 'eq-pierce-quiver', evolvedName: '星辉分裂炮', evolvedNameEn: 'Split Star Blaster' },
  { weaponId: 'orbit-shields', relicId: 'eq-holy-relic', evolvedName: '神圣脉冲环', evolvedNameEn: 'Pulse Orbit Shields' },
  { weaponId: 'frost-nova', relicId: 'eq-frost-ring', evolvedName: '回响极寒波', evolvedNameEn: 'Echo Frost Nova' },
  { weaponId: 'thunder-arc', relicId: 'eq-storm-amulet', evolvedName: '超载感电链', evolvedNameEn: 'Overload Thunder Arc' },
  { weaponId: 'rail-sniper', relicId: 'eq-executioner-blade', evolvedName: '破甲重轨狙', evolvedNameEn: 'Breaker Rail Sniper' },
];

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    id: 'first-victory',
    icon: '🏆',
    name: '初露锋芒',
    nameEn: 'First Triumph',
    desc: '任意关卡首次击败终局首领通关',
    descEn: 'Clear any stage for the first time',
    rewardStars: 15,
  },
  {
    id: 'slayer-250',
    icon: '⚔️',
    name: '百人斩先锋',
    nameEn: 'Horde Slayer',
    desc: '单局击杀数量达到 250 名敌人',
    descEn: 'Defeat 250 enemies in a single run',
    rewardStars: 15,
  },
  {
    id: 'slayer-600',
    icon: '🔥',
    name: '千军横扫',
    nameEn: 'Legion Crusher',
    desc: '单局击杀数量达到 600 名敌人',
    descEn: 'Defeat 600 enemies in a single run',
    rewardStars: 25,
  },
  {
    id: 'relic-collector-10',
    icon: '👑',
    name: '圣物学者',
    nameEn: 'Relic Scholar',
    desc: '累计图鉴点亮 10 件不同遗物',
    descEn: 'Discover 10 unique relics in Codex',
    rewardStars: 20,
  },
  {
    id: 'relic-collector-20',
    icon: '💎',
    name: '全能宝库',
    nameEn: 'Grand Curator',
    desc: '点亮全部 20 件遗物图鉴',
    descEn: 'Discover all 20 relics in Codex',
    rewardStars: 40,
  },
  {
    id: 'synergy-master',
    icon: '✨',
    name: '星耀觉醒师',
    nameEn: 'Synergy Awaker',
    desc: '触发过至少 3 种超武觉醒形态',
    descEn: 'Awaken 3 different evolved weapons',
    rewardStars: 25,
  },
  {
    id: 'endless-explorer',
    icon: '♾️',
    name: '深渊行者',
    nameEn: 'Abyss Walker',
    desc: '进入无尽深渊并完成结算',
    descEn: 'Enter Endless Abyss and complete a run',
    rewardStars: 20,
  },
  {
    id: 'challenge-victor',
    icon: '💥',
    name: '逆境征服者',
    nameEn: 'Adversity Victor',
    desc: '开启至少 1 项挑战词缀并通关',
    descEn: 'Win a stage with at least 1 Challenge Modifier active',
    rewardStars: 30,
  },
];
