import type {
  BuffDefinition,
  CharacterDefinition,
  DebuffDefinition,
  EnemyDefinition,
  EquipmentDefinition,
  LevelDefinition,
  UpgradeDefinition,
  WeaponDefinition,
} from '../definitions/ContentTypes';

export class TypedRegistry<T extends { readonly id: string }> {
  private readonly items = new Map<string, T>();

  public register(item: T): void {
    if (this.items.has(item.id)) {
      throw new Error(`Duplicate registration id: ${item.id}`);
    }
    this.items.set(item.id, Object.freeze(item));
  }

  public get(id: string): T | undefined {
    return this.items.get(id);
  }

  public getOrThrow(id: string, kind = 'Item'): T {
    const item = this.items.get(id);
    if (!item) {
      throw new Error(`${kind} "${id}" is not registered`);
    }
    return item;
  }

  public has(id: string): boolean {
    return this.items.has(id);
  }

  public list(): readonly T[] {
    return Array.from(this.items.values());
  }
}

export class BehaviorRegistry<T> {
  private readonly factories = new Map<string, () => T>();

  public register(id: string, factory: () => T): void {
    if (this.factories.has(id)) {
      throw new Error(`Duplicate behavior id: ${id}`);
    }
    this.factories.set(id, factory);
  }

  public has(id: string): boolean {
    return this.factories.has(id);
  }

  public create(id: string): T {
    const factory = this.factories.get(id);
    if (!factory) {
      throw new Error(`Behavior "${id}" is not registered`);
    }
    return factory();
  }
}

export interface ContentRegistries {
  characters: TypedRegistry<CharacterDefinition>;
  weapons: TypedRegistry<WeaponDefinition>;
  enemies: TypedRegistry<EnemyDefinition>;
  upgrades: TypedRegistry<UpgradeDefinition>;
  levels: TypedRegistry<LevelDefinition>;
  debuffs: TypedRegistry<DebuffDefinition>;
  buffs: TypedRegistry<BuffDefinition>;
  equipment: TypedRegistry<EquipmentDefinition>;
  weaponBehaviorIds: Set<string>;
  enemyBehaviorIds: Set<string>;
  objectiveBehaviorIds: Set<string>;
}
