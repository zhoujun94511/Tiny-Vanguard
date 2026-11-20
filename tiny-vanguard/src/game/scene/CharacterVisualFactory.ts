import * as THREE from 'three';
import type { CharacterDefinition } from '../content/definitions/ContentTypes';
import { createContactShadowTexture } from './ProceduralTextures';
import {
  applyFresnelRim,
  createOrbitTrackShaderMaterial,
  getVfxGlowTexture,
} from './VfxShaderFactory';

export interface CharacterVisualInstance {
  root: THREE.Group;
  body: THREE.Mesh;
  bodyMaterial: THREE.MeshStandardMaterial;
  cape: THREE.Object3D;
  thrusterMat: THREE.MeshBasicMaterial;
  leftFoot: THREE.Object3D;
  rightFoot: THREE.Object3D;
  weaponPivot: THREE.Group;
  thunderDrone: THREE.Group;
  sniperCannon: THREE.Group;
  frostCore: THREE.Group;
  relicCrownRing: THREE.Mesh;
  relicCrownMat: THREE.MeshBasicMaterial;
  shieldMeshes: THREE.Object3D[];
  orbitTrackRing: THREE.Mesh;
  novaRing: THREE.Mesh;
  novaEchoRing: THREE.Mesh;
}

export type CharacterVisualBuilder = (def: CharacterDefinition) => CharacterVisualInstance;

const builders = new Map<string, CharacterVisualBuilder>();

export function registerCharacterVisual(characterId: string, builder: CharacterVisualBuilder): void {
  builders.set(characterId, builder);
}

function attachSharedCombatAttachments(root: THREE.Group): {
  shieldMeshes: THREE.Object3D[];
  orbitTrackRing: THREE.Mesh;
  novaRing: THREE.Mesh;
  novaEchoRing: THREE.Mesh;
} {
  // Glowing GLSL rotating orbital energy track beneath Orbit Shields
  const trackGeo = new THREE.PlaneGeometry(2, 2);
  trackGeo.rotateX(-Math.PI / 2);
  const trackMat = createOrbitTrackShaderMaterial();
  const orbitTrackRing = new THREE.Mesh(trackGeo, trackMat);
  orbitTrackRing.position.y = 0.12;
  orbitTrackRing.visible = false;
  root.add(orbitTrackRing);

  // 6 Glowing Curved Plasma Crescent Blades + Swept Additive Arc Slash Trails
  const shieldGroup = new THREE.Group();
  const bladeCoreGeo = new THREE.OctahedronGeometry(0.22, 0);
  bladeCoreGeo.scale(0.55, 0.35, 1.85);
  const bladeCoreMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const arcTrailGeo = new THREE.RingGeometry(0.45, 0.92, 16, 1, -0.95, 1.35);
  arcTrailGeo.rotateX(-Math.PI / 2);
  const arcTrailMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const haloGeo = new THREE.PlaneGeometry(1.15, 1.15);
  haloGeo.rotateX(-Math.PI / 2);
  const haloMat = new THREE.MeshBasicMaterial({
    map: getVfxGlowTexture(),
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const finGeo = new THREE.ConeGeometry(0.16, 0.78, 4);
  finGeo.rotateX(Math.PI / 2);
  const finMat = new THREE.MeshStandardMaterial({
    color: 0x0ea5e9,
    emissive: 0x38bdf8,
    emissiveIntensity: 1.6,
    metalness: 0.8,
    roughness: 0.15,
  });

  const shieldMeshes: THREE.Object3D[] = [];
  for (let i = 0; i < 6; i += 1) {
    const bladeRoot = new THREE.Group();
    bladeRoot.visible = false;

    const fin = new THREE.Mesh(finGeo, finMat);
    bladeRoot.add(fin);

    const core = new THREE.Mesh(bladeCoreGeo, bladeCoreMat);
    bladeRoot.add(core);

    const arc = new THREE.Mesh(arcTrailGeo, arcTrailMat);
    arc.position.set(-0.55, 0, -0.1);
    bladeRoot.add(arc);

    const halo = new THREE.Mesh(haloGeo, haloMat);
    bladeRoot.add(halo);

    shieldGroup.add(bladeRoot);
    shieldMeshes.push(bladeRoot);
  }
  root.add(shieldGroup);

  // Subtle legacy nova ring slots (kept hidden or accenting GLSL shockwaves)
  const ringGeo = new THREE.RingGeometry(0.88, 1.0, 40);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x67e8f9,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const novaRing = new THREE.Mesh(ringGeo, ringMat);
  novaRing.position.y = 0.08;
  novaRing.visible = false;
  root.add(novaRing);

  const echoMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const novaEchoRing = new THREE.Mesh(ringGeo, echoMat);
  novaEchoRing.position.y = 0.09;
  novaEchoRing.visible = false;
  root.add(novaEchoRing);

  return { shieldMeshes, orbitTrackRing, novaRing, novaEchoRing };
}

/**
 * Hard-surface 3.5-head Armored Vanguard 3D silhouette (non-cartoon):
 * Angular V-tapered titanium breastplate, glowing chest reactor, swept shoulder pauldrons,
 * tactical faceted visor helmet, articulated armored greaves, twin energy thruster wings,
 * glowing plasma greatsword & hexagonal energy buckler.
 */
export const defaultChibiCharacterBuilder: CharacterVisualBuilder = (def) => {
  const root = new THREE.Group();

  // Soft ground contact shadow + subtle tactical locator ring
  const shadowTex = createContactShadowTexture();
  const shadowGeo = new THREE.PlaneGeometry(1.7, 1.7);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
  });
  const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.position.y = 0.02;
  root.add(shadowDisc);

  const isRanger = def.id === 'storm-ranger';
  const isBastion = def.id === 'iron-bastion';
  if (isBastion) {
    root.scale.set(1.24, 1.14, 1.24);
  } else if (isRanger) {
    root.scale.set(0.9, 0.96, 0.9);
  }

  const heroRingGeo = isBastion
    ? new THREE.RingGeometry(0.68, 0.86, 36)
    : new THREE.RingGeometry(0.68, 0.78, 36);
  heroRingGeo.rotateX(-Math.PI / 2);
  const energyHex = isRanger ? 0xa855f7 : isBastion ? 0xf97316 : 0x38bdf8;
  const armorBaseHex = isRanger ? 0x1d4ed8 : isBastion ? 0xb45309 : 0xf8fafc;
  const trimHex = isRanger ? 0xc084fc : isBastion ? 0xfb923c : def.primaryColor;
  const heroRingMat = new THREE.MeshBasicMaterial({
    color: energyHex,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const heroRing = new THREE.Mesh(heroRingGeo, heroRingMat);
  heroRing.position.y = 0.03;
  root.add(heroRing);

  // High-contrast metallic PBR materials with Fresnel Rim lighting
  const armorMat = applyFresnelRim(
    new THREE.MeshStandardMaterial({
      color: armorBaseHex,
      roughness: isBastion ? 0.36 : 0.24,
      metalness: isBastion ? 0.88 : 0.8,
    }),
    energyHex,
    2.4,
    0.72
  );
  const darkFrameMat = applyFresnelRim(
    new THREE.MeshStandardMaterial({
      color: isRanger ? 0x0f172a : 0x1e293b,
      roughness: 0.42,
      metalness: 0.72,
    }),
    energyHex,
    2.8,
    0.45
  );
  const goldTrimMat = applyFresnelRim(
    new THREE.MeshStandardMaterial({
      color: trimHex,
      emissive: isBastion ? 0x9a3412 : isRanger ? 0x6b21a8 : 0x78350f,
      emissiveIntensity: 0.34,
      roughness: 0.22,
      metalness: 0.88,
    }),
    trimHex,
    2.2,
    0.55
  );
  const reactorMat = new THREE.MeshBasicMaterial({
    color: energyHex,
  });
  const thrusterMat = new THREE.MeshBasicMaterial({
    color: energyHex,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  // 1. V-Tapered Angular Armored Torso (tailored silhouette per archetype)
  const torsoGeo = new THREE.CylinderGeometry(
    isRanger ? 0.3 : isBastion ? 0.44 : 0.36,
    isRanger ? 0.2 : isBastion ? 0.32 : 0.24,
    0.64,
    6
  );
  const body = new THREE.Mesh(torsoGeo, armorMat);
  body.position.y = 0.82;
  body.castShadow = true;
  root.add(body);

  // Chest armor front bevel plate + glowing core reactor
  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.24), armorMat);
  chestPlate.position.set(0, 0.08, 0.16);
  chestPlate.castShadow = true;
  body.add(chestPlate);

  const reactorCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), reactorMat);
  reactorCore.scale.set(1.0, 1.25, 0.5);
  reactorCore.position.set(0, 0.08, 0.29);
  body.add(reactorCore);

  const reactorGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.42),
    new THREE.MeshBasicMaterial({
      map: getVfxGlowTexture(),
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  reactorGlow.position.set(0, 0.08, 0.33);
  body.add(reactorGlow);

  // Armored pelvis & tactical belt
  const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.18, 6), darkFrameMat);
  waist.position.y = -0.32;
  body.add(waist);

  const beltBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.11, 0.1), goldTrimMat);
  beltBuckle.position.set(0, 0, 0.24);
  waist.add(beltBuckle);

  // 2. Shoulder Pauldrons (Sleek Ranger fins vs Knight vs Heavy Bastion fortress plates)
  const pauldronGeo = new THREE.BoxGeometry(
    isRanger ? 0.24 : isBastion ? 0.46 : 0.34,
    isRanger ? 0.2 : isBastion ? 0.34 : 0.28,
    isRanger ? 0.3 : isBastion ? 0.48 : 0.4
  );
  for (const side of [-1, 1]) {
    const pGroup = new THREE.Group();
    pGroup.position.set(side * (isRanger ? 0.36 : isBastion ? 0.5 : 0.42), 0.22, 0);
    pGroup.rotation.z = -side * (isRanger ? 0.48 : isBastion ? 0.16 : 0.32);

    const pMain = new THREE.Mesh(pauldronGeo, armorMat);
    pMain.castShadow = true;
    pGroup.add(pMain);

    const pTrim = new THREE.Mesh(
      new THREE.BoxGeometry(isBastion ? 0.48 : 0.37, 0.06, isBastion ? 0.5 : 0.43),
      goldTrimMat
    );
    pTrim.position.y = isBastion ? 0.16 : 0.12;
    pGroup.add(pTrim);

    const pVent = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.44), reactorMat);
    pVent.position.set(side * 0.06, -0.02, 0);
    pGroup.add(pVent);

    body.add(pGroup);
  }

  // 3. Archetype-Distinct Headgear (Knight Crest / Ranger Hood+Antennas / Bastion Heavy Visor)
  const helmGroup = new THREE.Group();
  helmGroup.position.set(0, 0.56, 0.02);
  body.add(helmGroup);

  const helmCore = isBastion
    ? new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.46, 0.48), armorMat)
    : new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 1), armorMat);
  if (!isBastion) {
    helmCore.scale.set(isRanger ? 0.86 : 0.92, isRanger ? 1.04 : 1.08, isRanger ? 1.12 : 1.06);
  }
  helmCore.castShadow = true;
  helmGroup.add(helmCore);

  const jawGuard = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.34), darkFrameMat);
  jawGuard.position.set(0, -0.15, 0.06);
  helmGroup.add(jawGuard);

  const visorMask = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.11, 0.14), darkFrameMat);
  visorMask.position.set(0, -0.02, 0.24);
  helmGroup.add(visorMask);

  const visorGlow = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.055, 0.06), reactorMat);
  visorGlow.position.set(0, -0.02, 0.3);
  helmGroup.add(visorGlow);

  const finMat = new THREE.MeshStandardMaterial({
    color: def.accentColor,
    emissive: def.accentColor,
    emissiveIntensity: 0.75,
    roughness: 0.28,
    metalness: 0.5,
  });

  if (isRanger) {
    // Sleek twin swept ear-antennas + pointed hood tail
    for (const side of [-1, 1]) {
      const earFin = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.34, 4), finMat);
      earFin.position.set(side * 0.26, 0.18, -0.08);
      earFin.rotation.set(-0.75, 0, -side * 0.35);
      helmGroup.add(earFin);
    }
    const hoodTip = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.36, 4), goldTrimMat);
    hoodTip.position.set(0, 0.22, -0.2);
    hoodTip.rotation.x = -1.05;
    helmGroup.add(hoodTip);
  } else if (isBastion) {
    // Heavy twin brow horns + armored top plate
    const browPlate = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.1, 0.52), goldTrimMat);
    browPlate.position.set(0, 0.24, 0.02);
    helmGroup.add(browPlate);
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.14), finMat);
      horn.position.set(side * 0.24, 0.28, 0.18);
      horn.rotation.z = -side * 0.2;
      helmGroup.add(horn);
    }
  } else {
    const crestMain = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.46), goldTrimMat);
    crestMain.position.set(0, 0.24, -0.04);
    crestMain.rotation.x = -0.25;
    helmGroup.add(crestMain);

    const crestPlume = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.38, 4), finMat);
    crestPlume.position.set(0, 0.32, -0.22);
    crestPlume.rotation.x = -0.95;
    helmGroup.add(crestPlume);
  }

  // 4. Back Energy Thruster Wings (4-wing storm array for Ranger, heavy thruster pack for Bastion)
  const wingRack = new THREE.Group();
  wingRack.position.set(0, 0.18, -0.26);
  const backpack = new THREE.Mesh(
    new THREE.BoxGeometry(isBastion ? 0.46 : 0.36, 0.36, isBastion ? 0.24 : 0.18),
    darkFrameMat
  );
  wingRack.add(backpack);

  const wingBladeGeo = new THREE.ConeGeometry(0.14, isRanger ? 1.1 : 0.92, 4);
  wingBladeGeo.scale(0.35, 1, 1.3);
  for (const side of [-1, 1]) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.12), goldTrimMat);
    pylon.position.set(side * 0.26, 0.16, -0.06);
    pylon.rotation.z = -side * 0.55;
    wingRack.add(pylon);

    const energyWing = new THREE.Mesh(wingBladeGeo, thrusterMat);
    energyWing.position.set(side * (isRanger ? 0.62 : 0.54), 0.12, -0.2);
    energyWing.rotation.set(-0.55, side * 0.22, -side * 0.82);
    wingRack.add(energyWing);

    if (isRanger) {
      const subWing = new THREE.Mesh(wingBladeGeo, thrusterMat);
      subWing.scale.setScalar(0.72);
      subWing.position.set(side * 0.46, -0.08, -0.18);
      subWing.rotation.set(-0.45, side * 0.18, -side * 1.15);
      wingRack.add(subWing);
    }
  }
  body.add(wingRack);

  // 5. Left Arm: Ranger Twin Energy Dagger / Bastion Tower Shield / Knight Hex Buckler
  const shieldHolder = new THREE.Group();
  shieldHolder.position.set(isBastion ? -0.56 : -0.48, -0.04, 0.16);
  if (isRanger) {
    // Sleek off-hand storm blade instead of heavy shield
    const offHilt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.26), darkFrameMat);
    shieldHolder.add(offHilt);
    const offBlade = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.03, 0.72),
      new THREE.MeshStandardMaterial({
        color: 0xf3e8ff,
        emissive: 0xa855f7,
        emissiveIntensity: 1.4,
        roughness: 0.15,
        metalness: 0.9,
      })
    );
    offBlade.position.set(0, 0, 0.42);
    shieldHolder.add(offBlade);
  } else if (isBastion) {
    // Heavy rectangular fortress tower shield
    const towerBody = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.88, 0.11), darkFrameMat);
    towerBody.castShadow = true;
    shieldHolder.add(towerBody);
    const towerTrim = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.94, 0.06), goldTrimMat);
    towerTrim.position.z = -0.01;
    shieldHolder.add(towerTrim);
    const towerCore = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.56, 0.13),
      new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.82 })
    );
    shieldHolder.add(towerCore);
  } else {
    const hexFrame = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.07, 6), darkFrameMat);
    hexFrame.rotation.x = Math.PI / 2;
    hexFrame.castShadow = true;
    shieldHolder.add(hexFrame);

    const hexEnergy = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.08, 6),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.78,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    hexEnergy.rotation.x = Math.PI / 2;
    shieldHolder.add(hexEnergy);

    const hexRim = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.032, 6, 6), goldTrimMat);
    hexRim.position.z = 0.03;
    shieldHolder.add(hexRim);
  }
  body.add(shieldHolder);

  // 6. Right Arm: Ranger Pulse Blade / Bastion Siege Hammer / Knight Plasma Greatsword
  const weaponPivot = new THREE.Group();
  weaponPivot.position.set(isBastion ? 0.56 : 0.48, 0.78, 0.14);

  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.26, 6), darkFrameMat);
  hilt.rotation.x = Math.PI * 0.45;
  weaponPivot.add(hilt);

  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.07, 0.09), goldTrimMat);
  guard.position.set(0, 0.04, 0.14);
  weaponPivot.add(guard);

  let bladeGlow: THREE.Mesh;
  if (isBastion) {
    // Heavy Siege Hammer
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.92, 6), darkFrameMat);
    shaft.rotation.x = Math.PI * 0.5;
    shaft.position.set(0, 0.05, 0.52);
    weaponPivot.add(shaft);

    const hammerHead = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.34), armorMat);
    hammerHead.position.set(0, 0.06, 0.92);
    hammerHead.castShadow = true;
    weaponPivot.add(hammerHead);

    const hammerCore = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.18),
      new THREE.MeshStandardMaterial({
        color: 0xffedd5,
        emissive: 0xf97316,
        emissiveIntensity: 1.5,
        roughness: 0.2,
        metalness: 0.7,
      })
    );
    hammerCore.position.set(0, 0.06, 0.92);
    weaponPivot.add(hammerCore);

    bladeGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.6),
      new THREE.MeshBasicMaterial({
        map: getVfxGlowTexture(),
        color: 0xf97316,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    bladeGlow.rotation.x = -Math.PI / 2;
    bladeGlow.position.set(0, 0.07, 0.92);
    weaponPivot.add(bladeGlow);
  } else {
    const bladeCore = new THREE.Mesh(
      new THREE.BoxGeometry(isRanger ? 0.07 : 0.1, 0.036, isRanger ? 0.84 : 1.05),
      new THREE.MeshStandardMaterial({
        color: isRanger ? 0xf3e8ff : 0xe0f2fe,
        emissive: energyHex,
        emissiveIntensity: 1.45,
        roughness: 0.12,
        metalness: 0.9,
      })
    );
    bladeCore.position.set(0, 0.06, isRanger ? 0.56 : 0.68);
    bladeCore.castShadow = true;
    weaponPivot.add(bladeCore);

    bladeGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.36, isRanger ? 0.96 : 1.2),
      new THREE.MeshBasicMaterial({
        map: getVfxGlowTexture(),
        color: energyHex,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    bladeGlow.rotation.x = -Math.PI / 2;
    bladeGlow.position.set(0, 0.07, isRanger ? 0.58 : 0.7);
    weaponPivot.add(bladeGlow);
  }
  root.add(weaponPivot);

  // 7. Articulated Armored Legs / Greaves
  const makeLeg = (side: number) => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.18, 0.46, 0);

    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.18), darkFrameMat);
    thigh.position.y = -0.1;
    leg.add(thigh);

    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, 0.22), armorMat);
    shin.position.set(0, -0.32, 0.02);
    shin.castShadow = true;
    leg.add(shin);

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.3), darkFrameMat);
    boot.position.set(0, -0.4, 0.06);
    leg.add(boot);

    root.add(leg);
    return leg;
  };
  const leftFoot = makeLeg(-1);
  const rightFoot = makeLeg(1);

  // 8. Modular Unlockable Weapon & Relic Gear (toggled live via bitmask/count, zero GC)
  // 8a. Left-shoulder Hovering Tesla Drone (thunder-arc)
  const thunderDrone = new THREE.Group();
  thunderDrone.position.set(-0.74, 1.54, -0.04);
  thunderDrone.visible = false;
  const droneChassis = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.22, 6), darkFrameMat);
  thunderDrone.add(droneChassis);
  const droneCoilMat = new THREE.MeshStandardMaterial({
    color: 0xa855f7,
    emissive: 0x7e22ce,
    emissiveIntensity: 1.25,
    roughness: 0.2,
    metalness: 0.85,
  });
  const droneCoilRing = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.032, 6, 12), droneCoilMat);
  droneCoilRing.rotation.x = Math.PI / 2;
  droneCoilRing.position.y = 0.06;
  thunderDrone.add(droneCoilRing);
  const droneSpire = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), reactorMat);
  droneSpire.position.y = 0.22;
  thunderDrone.add(droneSpire);
  const droneHalo = new THREE.Mesh(
    new THREE.PlaneGeometry(0.56, 0.56),
    new THREE.MeshBasicMaterial({
      map: getVfxGlowTexture(),
      color: 0xc084fc,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  droneHalo.rotation.x = -Math.PI / 2;
  droneHalo.position.y = 0.16;
  thunderDrone.add(droneHalo);
  root.add(thunderDrone);

  // 8b. Right-shoulder Heavy Railgun Pod (rail-sniper)
  const sniperCannon = new THREE.Group();
  sniperCannon.position.set(0.56, 1.38, -0.02);
  sniperCannon.visible = false;
  const podMount = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.54), darkFrameMat);
  podMount.castShadow = true;
  sniperCannon.add(podMount);
  const railBarMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.3,
    roughness: 0.18,
    metalness: 0.9,
  });
  for (const offset of [-0.055, 0.055]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.075, 0.88), railBarMat);
    rail.position.set(offset, 0.03, 0.42);
    sniperCannon.add(rail);
  }
  const muzzleCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), railBarMat);
  muzzleCore.position.set(0, 0.03, 0.88);
  sniperCannon.add(muzzleCore);
  root.add(sniperCannon);

  // 8c. Dorsal Cryo Capacitor Twin Crystals (frost-nova)
  const frostCore = new THREE.Group();
  frostCore.position.set(0, 1.18, -0.46);
  frostCore.visible = false;
  const cryoMat = new THREE.MeshStandardMaterial({
    color: 0xbae6fd,
    emissive: 0x0ea5e9,
    emissiveIntensity: 1.25,
    roughness: 0.16,
    metalness: 0.35,
  });
  for (const side of [-1, 1]) {
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), cryoMat);
    shard.scale.set(0.75, 1.65, 0.75);
    shard.position.set(side * 0.2, 0.12, -0.04);
    shard.rotation.z = side * -0.35;
    shard.rotation.x = -0.22;
    frostCore.add(shard);
  }
  const cryoGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.72, 0.72),
    new THREE.MeshBasicMaterial({
      map: getVfxGlowTexture(),
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  cryoGlow.rotation.x = -Math.PI / 2;
  frostCore.add(cryoGlow);
  root.add(frostCore);

  // 8d. Dorsal Sacred Relic Crown Ring (relicCount > 0, evolves at >=5 & >=12 relics)
  const relicCrownMat = new THREE.MeshBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.85,
  });
  const relicCrownRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.46, 0.036, 8, 24),
    relicCrownMat
  );
  relicCrownRing.position.set(0, 1.66, -0.2);
  relicCrownRing.rotation.x = Math.PI * 0.34;
  relicCrownRing.visible = false;
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.085, 0), goldTrimMat);
    gem.position.set(Math.cos(angle) * 0.46, Math.sin(angle) * 0.46, 0);
    relicCrownRing.add(gem);
  }
  root.add(relicCrownRing);

  const attachments = attachSharedCombatAttachments(root);

  return {
    root,
    body,
    bodyMaterial: armorMat,
    cape: wingRack,
    thrusterMat,
    leftFoot,
    rightFoot,
    weaponPivot,
    thunderDrone,
    sniperCannon,
    frostCore,
    relicCrownRing,
    relicCrownMat,
    ...attachments,
  };
};

registerCharacterVisual('chibi-knight', defaultChibiCharacterBuilder);
registerCharacterVisual('storm-ranger', defaultChibiCharacterBuilder);
registerCharacterVisual('iron-bastion', defaultChibiCharacterBuilder);

export function createCharacterVisual(def: CharacterDefinition): CharacterVisualInstance {
  const builder = builders.get(def.id) ?? defaultChibiCharacterBuilder;
  return builder(def);
}
