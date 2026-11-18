import * as THREE from 'three';
import type { CharacterDefinition, LevelDefinition } from '../content/definitions/ContentTypes';
import {
  createCharacterVisual,
  type CharacterVisualInstance,
} from './CharacterVisualFactory';
import { disposeObjectSubtree } from './disposeSubtree';
import {
  createProceduralEnvironment,
  markCachedTerrainTexturesDirty,
  SHARED_TERRAIN_TEXTURES,
} from './ProceduralTextures';
import {
  createBridgeArenaGroup,
  createObstacleProp,
  createSunnyMeadowGroup,
} from './PropVisualFactory';
import { markVfxTexturesDirty } from './VfxShaderFactory';

export class SceneArena {
  public readonly scene = new THREE.Scene();
  public readonly dirLight: THREE.DirectionalLight;
  public readonly rimLight: THREE.DirectionalLight;
  public readonly hemiLight: THREE.HemisphereLight;
  public playerVisual: CharacterVisualInstance | null = null;

  private activeCharacterId: string | null = null;
  private envTexture: THREE.Texture | null = null;
  private readonly levelGroup = new THREE.Group();

  constructor() {
    this.scene.background = new THREE.Color(0x111a2c);
    this.scene.fog = new THREE.Fog(0x111a2c, 32, 72);

    // Three-point dramatic 3D lighting: controlled fill + strong warm key + cool rear rim light
    this.hemiLight = new THREE.HemisphereLight(0x9ec5f8, 0x162230, 0.48);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfff1dc, 1.72);
    this.dirLight.position.set(14, 22, 12);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.camera.near = 2;
    this.dirLight.shadow.camera.far = 65;
    const s = 22;
    this.dirLight.shadow.camera.left = -s;
    this.dirLight.shadow.camera.right = s;
    this.dirLight.shadow.camera.top = s;
    this.dirLight.shadow.camera.bottom = -s;
    this.dirLight.shadow.bias = -0.0008;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    this.rimLight = new THREE.DirectionalLight(0x60a5fa, 0.92);
    this.rimLight.position.set(-14, 14, -16);
    this.scene.add(this.rimLight);
    this.scene.add(this.rimLight.target);

    this.scene.add(this.levelGroup);
  }

  public initEnvironment(renderer: THREE.WebGLRenderer): void {
    if (this.envTexture) return;
    this.envTexture = createProceduralEnvironment(renderer);
    this.scene.environment = this.envTexture;
    this.scene.environmentIntensity = 0.85;
  }

  public restoreEnvironment(renderer: THREE.WebGLRenderer): void {
    if (this.envTexture) {
      this.envTexture.dispose();
      this.envTexture = null;
    }
    this.initEnvironment(renderer);
    markCachedTerrainTexturesDirty();
    markVfxTexturesDirty();
    this.scene.traverse((obj) => {
      const m = obj as THREE.Mesh;
      const mat = m.material as THREE.MeshStandardMaterial | undefined;
      if (mat && !Array.isArray(mat) && mat.map) {
        mat.map.needsUpdate = true;
      }
    });
  }

  public mountCharacter(def: CharacterDefinition): void {
    if (this.playerVisual && this.activeCharacterId === def.id) {
      return;
    }
    if (this.playerVisual) {
      this.scene.remove(this.playerVisual.root);
      disposeObjectSubtree(this.playerVisual.root);
      this.playerVisual = null;
    }
    this.playerVisual = createCharacterVisual(def);
    this.activeCharacterId = def.id;
    this.scene.add(this.playerVisual.root);
  }

  public buildLevelEnvironment(level: LevelDefinition, character: CharacterDefinition): void {
    this.clearLevelEnvironment();
    this.mountCharacter(character);

    this.scene.background = new THREE.Color(level.fogColor);
    this.scene.fog = new THREE.Fog(level.fogColor, 38, 82);

    if (level.arenaShape === 'bridge' && level.bridgeConfig) {
      this.levelGroup.add(createBridgeArenaGroup(level.bridgeConfig));
      return;
    }

    this.levelGroup.add(
      createSunnyMeadowGroup(
        level.arenaRadius,
        level.groundColor,
        level.gridColor,
        level.pathColor ?? 0xe9d6a8
      )
    );

    for (const obs of level.obstacles) {
      this.levelGroup.add(createObstacleProp(obs));
    }
  }

  public updatePlayerVisual(
    x: number,
    z: number,
    facingRad: number,
    isMoving: boolean,
    simTimeSec: number,
    _dt: number,
    isHitFlashing: boolean,
    comboTier = 0,
    activeWeaponMask = 0,
    relicCount = 0
  ): void {
    const pv = this.playerVisual;
    if (!pv) return;

    pv.root.position.set(x, 0, z);
    pv.root.rotation.y = facingRad;

    if (isMoving) {
      const bob = Math.abs(Math.sin(simTimeSec * 13)) * 0.08;
      pv.body.position.y = 0.82 + bob;
      const swing = Math.sin(simTimeSec * 13) * 0.45;
      pv.leftFoot.rotation.x = swing;
      pv.rightFoot.rotation.x = -swing;
      pv.cape.scale.set(1.08, 1.12 + Math.sin(simTimeSec * 22) * 0.1, 1.15);
      pv.weaponPivot.rotation.x = -0.18 + Math.sin(simTimeSec * 13) * 0.25;
    } else {
      pv.body.position.y = 0.82 + Math.sin(simTimeSec * 3.2) * 0.025;
      pv.leftFoot.rotation.x = 0;
      pv.rightFoot.rotation.x = 0;
      pv.cape.scale.set(1, 0.96 + Math.sin(simTimeSec * 5) * 0.05, 1);
      pv.weaponPivot.rotation.x = Math.sin(simTimeSec * 3.2) * 0.06;
    }

    // Dynamic energy thruster wing color reacts to Combo Fever tiers
    const wingHex = comboTier >= 3 ? 0xfbbf24 : comboTier >= 2 ? 0xe879f9 : 0x38bdf8;
    pv.thrusterMat.color.setHex(wingHex);

    // Modular weapon attachments driven by zero-GC bitmask (1=thunder, 2=sniper, 4=frost)
    const hasThunder = (activeWeaponMask & 1) !== 0;
    pv.thunderDrone.visible = hasThunder;
    if (hasThunder) {
      pv.thunderDrone.position.y = 1.54 + Math.sin(simTimeSec * 5.2) * 0.08;
      pv.thunderDrone.rotation.y = simTimeSec * 2.4;
    }

    const hasSniper = (activeWeaponMask & 2) !== 0;
    pv.sniperCannon.visible = hasSniper;
    if (hasSniper) {
      pv.sniperCannon.position.y = 1.38 + (isMoving ? Math.sin(simTimeSec * 13) * 0.03 : 0);
      pv.sniperCannon.rotation.x = isMoving ? -0.06 : 0;
    }

    const hasFrost = (activeWeaponMask & 4) !== 0;
    pv.frostCore.visible = hasFrost;
    if (hasFrost) {
      const pulse = 1 + Math.sin(simTimeSec * 4.5) * 0.08;
      pv.frostCore.scale.set(pulse, pulse, pulse);
    }

    // Sacred relic halo scales & shifts color tier as player accumulates relics
    const hasRelics = relicCount > 0;
    pv.relicCrownRing.visible = hasRelics;
    if (hasRelics) {
      pv.relicCrownRing.rotation.z = simTimeSec * (relicCount >= 12 ? 2.4 : 1.35);
      const relicScale = relicCount >= 12 ? 1.24 : relicCount >= 5 ? 1.12 : 1.0;
      pv.relicCrownRing.scale.set(relicScale, relicScale, relicScale);
      const relicHex = relicCount >= 12 ? 0xfef08a : relicCount >= 5 ? 0xe879f9 : 0xfbbf24;
      pv.relicCrownMat.color.setHex(relicHex);
    }

    if (isHitFlashing) {
      pv.bodyMaterial.emissive.setHex(0xff3344);
      pv.bodyMaterial.emissiveIntensity = 0.85;
    } else {
      pv.bodyMaterial.emissive.setHex(0x000000);
      pv.bodyMaterial.emissiveIntensity = 0;
    }

    this.dirLight.position.set(x + 14, 22, z + 12);
    this.dirLight.target.position.set(x, 0, z);
    this.dirLight.target.updateMatrixWorld();

    this.rimLight.position.set(x - 14, 14, z - 16);
    this.rimLight.target.position.set(x, 0, z);
    this.rimLight.target.updateMatrixWorld();
  }

  public clearLevelEnvironment(): void {
    disposeObjectSubtree(this.levelGroup, SHARED_TERRAIN_TEXTURES);
    while (this.levelGroup.children.length > 0) {
      this.levelGroup.remove(this.levelGroup.children[0]);
    }
  }

  public dispose(): void {
    this.clearLevelEnvironment();
    if (this.dirLight.shadow.map) {
      this.dirLight.shadow.map.dispose();
      this.dirLight.shadow.map = null;
    }
    if (this.envTexture) {
      this.envTexture.dispose();
      this.envTexture = null;
      this.scene.environment = null;
    }
    if (this.playerVisual) {
      this.scene.remove(this.playerVisual.root);
      disposeObjectSubtree(this.playerVisual.root);
      this.playerVisual = null;
      this.activeCharacterId = null;
    }
  }
}
