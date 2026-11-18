import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RUNTIME_CONFIG } from '../config/runtimeConfig';
import { DEBUFF_BY_ID } from '../content/effects/debuffs';
import type { LanguageCode } from '../core/GameTypes';
import type { ObjectPool } from '../pool/ObjectPool';
import type {
  BridgeGateState,
  DropEntity,
  EnemyEntity,
  ProjectileEntity,
  SupplyCrateState,
  VfxBeam,
  VfxParticle,
  VfxShockwave,
} from '../session/SessionEntities';
import { createContactShadowTexture, createLaserGrateTexture } from './ProceduralTextures';
import { createSupplyCrateProp } from './PropVisualFactory';
import {
  applyFresnelRim,
  createBeaconPillarMaterial,
  createShockwaveShaderMaterial,
  getVfxGlowTexture,
  getVfxTrailTexture,
  markVfxTexturesDirty,
} from './VfxShaderFactory';

const IDX_ARMOR_SHRED = DEBUFF_BY_ID['armor-shred'].index;
const IDX_HEAVY_SUNDER = DEBUFF_BY_ID['heavy-sunder'].index;
const IDX_SHOCK_STATIC = DEBUFF_BY_ID['shock-static'].index;

function colorizePart(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const nonIndexed = geo.index ? geo.toNonIndexed() : geo;
  if (nonIndexed !== geo) geo.dispose();
  if (!nonIndexed.attributes.normal) {
    nonIndexed.computeVertexNormals();
  }
  if (nonIndexed.attributes.uv) {
    nonIndexed.deleteAttribute('uv');
  }
  const count = nonIndexed.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color(hex);
  for (let i = 0; i < count; i += 1) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  nonIndexed.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return nonIndexed;
}

function mergeColoredParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return merged;
}

/**
 * Multi-ring elliptical lofted hull builder.
 * Each section is [y, rx, rz, cx?, cz?] from bottom to top, producing tapered organic/armored silhouettes.
 */
function loftedProfile(
  sections: ReadonlyArray<readonly [number, number, number, number?, number?]>,
  segments = 10
): THREE.BufferGeometry {
  const rings =
    sections[0][0] > sections[sections.length - 1][0] ? sections.slice().reverse() : sections;
  const vertices: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j < rings.length; j += 1) {
    const [y, rx, rz, cx = 0, cz = 0] = rings[j];
    for (let i = 0; i <= segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      vertices.push(cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz);
      if (j > 0 && i > 0) {
        const p = j * (segments + 1) + i;
        indices.push(p - 1, p - segments - 1, p - segments - 2, p - 1, p, p - segments - 1);
      }
    }
  }

  // Cap bottom and top rings
  for (const [row, reverse] of [
    [0, false],
    [rings.length - 1, true],
  ] as const) {
    const start = row * (segments + 1);
    for (let i = 1; i < segments - 1; i += 1) {
      if (reverse) indices.push(start, start + i + 1, start + i);
      else indices.push(start, start + i, start + i + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Centered beveled 2D polygon extrusion helper for shields, war-blades, scythe claws, and pauldrons.
 */
function extrudeShape(
  points: ReadonlyArray<readonly [number, number]>,
  depth: number,
  bevel = 0.022
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) {
    shape.lineTo(points[i][0], points[i][1]);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSegments: 1,
    steps: 1,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 4,
  });
  geo.translate(0, 0, -depth * 0.5);
  geo.computeVertexNormals();
  return geo;
}

/**
 * 1. Rift Stalker (Swarmer / Chaser):
 * Sculpted segmented arthropod predator: arched thorax, tapered raised abdomen,
 * 6 wide-splayed 2-jointed spider/mantis legs, serrated gold mantis scythes, and glowing eyes.
 */
function buildRiftStalkerGeometry(): THREE.BufferGeometry {
  const thorax = loftedProfile(
    [
      [-0.36, 0.14, 0.12, 0, 0.04],
      [-0.12, 0.34, 0.25, 0, 0.02],
      [0.14, 0.38, 0.28, 0, 0],
      [0.34, 0.22, 0.18, 0, -0.02],
    ],
    8
  );
  thorax.rotateX(Math.PI * 0.46);
  thorax.translate(0, 0.14, 0.06);

  const abdomen = loftedProfile(
    [
      [-0.3, 0.16, 0.14],
      [-0.08, 0.32, 0.28],
      [0.16, 0.28, 0.24],
      [0.38, 0.1, 0.1],
    ],
    8
  );
  abdomen.rotateX(-Math.PI * 0.36);
  abdomen.translate(0, 0.22, -0.34);

  const underbelly = new RoundedBoxGeometry(0.42, 0.16, 0.56, 2, 0.04);
  underbelly.translate(0, 0.02, -0.04);

  const head = new RoundedBoxGeometry(0.36, 0.22, 0.28, 2, 0.05);
  head.rotateX(0.2);
  head.translate(0, 0.14, 0.42);

  const eyeL = new RoundedBoxGeometry(0.11, 0.08, 0.1, 1, 0.02);
  eyeL.translate(-0.12, 0.19, 0.52);
  const eyeR = new RoundedBoxGeometry(0.11, 0.08, 0.1, 1, 0.02);
  eyeR.translate(0.12, 0.19, 0.52);

  const crestA = extrudeShape(
    [
      [0, 0],
      [0.18, 0.12],
      [0.06, 0.36],
      [-0.08, 0.14],
    ],
    0.05,
    0.012
  );
  crestA.rotateY(Math.PI * 0.5);
  crestA.translate(0, 0.3, -0.2);

  const crestB = crestA.clone();
  crestB.scale(0.8, 0.8, 0.8);
  crestB.translate(0, 0.1, -0.22);

  const parts: THREE.BufferGeometry[] = [
    colorizePart(thorax, 0xffffff),
    colorizePart(abdomen, 0xe2e8f0),
    colorizePart(underbelly, 0x1e293b),
    colorizePart(head, 0xcbd5e1),
    colorizePart(eyeL, 0xfef08a),
    colorizePart(eyeR, 0xfef08a),
    colorizePart(crestA, 0xfbbf24),
    colorizePart(crestB, 0xfbbf24),
  ];

  // 6 wide-splayed 2-jointed arthropod legs (femur rising outward + tibia down to ground)
  for (const side of [-1, 1]) {
    for (const [lz, sweepZ, spanX] of [
      [0.2, 0.14, 0.54],
      [-0.04, 0.0, 0.62],
      [-0.28, -0.18, 0.54],
    ] as const) {
      const femur = new RoundedBoxGeometry(0.28, 0.085, 0.09, 1, 0.02);
      femur.rotateZ(side * 0.35);
      femur.rotateY(side * -sweepZ);
      femur.translate(side * 0.38, 0.14, lz);
      parts.push(colorizePart(femur, 0x1e293b));

      const tibia = new RoundedBoxGeometry(0.08, 0.42, 0.085, 1, 0.02);
      tibia.rotateZ(side * -0.34);
      tibia.translate(side * spanX, -0.06, lz + sweepZ * 0.45);
      parts.push(colorizePart(tibia, 0xf1f5f9));
    }

    // Serrated mantis scythe-claws
    const scythe = extrudeShape(
      [
        [0, 0],
        [0.14, 0.32],
        [0.03, 0.56],
        [-0.06, 0.24],
      ],
      0.045,
      0.012
    );
    scythe.rotateY(Math.PI * 0.5);
    scythe.rotateX(Math.PI * 0.42);
    scythe.rotateZ(side * -0.25);
    scythe.translate(side * 0.24, 0.06, 0.52);
    parts.push(colorizePart(scythe, 0xfbbf24));
  }

  return mergeColoredParts(parts);
}

/**
 * 2. Quadruped Armored Ravager Beast (Charger):
 * Tapered muscular beast hull, dark iron saddle barding with gold trim,
 * 4 multi-jointed heavy legs, horned war-skull & dorsal ridge plates.
 */
function buildRavagerBeastGeometry(): THREE.BufferGeometry {
  const hull = loftedProfile(
    [
      [-0.5, 0.2, 0.18, 0, -0.04],
      [-0.18, 0.34, 0.28, 0, 0],
      [0.18, 0.46, 0.38, 0, 0.05],
      [0.44, 0.36, 0.3, 0, 0.02],
    ],
    10
  );
  hull.rotateX(Math.PI * 0.5);
  hull.translate(0, 0.14, 0.02);

  const barding = new RoundedBoxGeometry(0.84, 0.32, 0.6, 2, 0.07);
  barding.translate(0, 0.3, 0.08);

  const head = new RoundedBoxGeometry(0.46, 0.36, 0.46, 2, 0.08);
  head.rotateX(0.28);
  head.translate(0, 0.2, 0.62);

  const snout = new RoundedBoxGeometry(0.32, 0.22, 0.24, 2, 0.05);
  snout.translate(0, 0.1, 0.82);

  const parts: THREE.BufferGeometry[] = [
    colorizePart(hull, 0xffffff),
    colorizePart(barding, 0x1e293b),
    colorizePart(head, 0xcbd5e1),
    colorizePart(snout, 0x94a3b8),
  ];

  // Glowing crimson beast eyes + wide sweeping extruded battering horns
  for (const side of [-1, 1]) {
    const eye = new RoundedBoxGeometry(0.11, 0.07, 0.1, 1, 0.02);
    eye.translate(side * 0.16, 0.27, 0.82);
    parts.push(colorizePart(eye, 0xf43f5e));

    const horn = extrudeShape(
      [
        [0, 0],
        [0.14, 0.08],
        [0.24, 0.34],
        [0.08, 0.58],
        [-0.04, 0.24],
      ],
      0.07,
      0.015
    );
    horn.rotateY(side > 0 ? Math.PI * 0.5 - 0.32 : Math.PI * 0.5 + 0.32);
    horn.rotateX(Math.PI * 0.34);
    horn.translate(side * 0.26, 0.22, 0.78);
    parts.push(colorizePart(horn, 0xfbbf24));
  }

  // 3 jagged gold dorsal spines along spine
  for (const [sz, scale] of [
    [0.24, 1.0],
    [-0.04, 0.88],
    [-0.32, 0.74],
  ] as const) {
    const spike = extrudeShape(
      [
        [0, 0],
        [0.22, 0],
        [0.04, 0.34],
        [-0.12, 0.16],
      ],
      0.08,
      0.015
    );
    spike.rotateY(Math.PI * 0.5);
    spike.scale(scale, scale, scale);
    spike.translate(0, 0.44, sz);
    parts.push(colorizePart(spike, 0xfbbf24));
  }

  // 4 jointed armored quadruped legs
  for (const side of [-1, 1]) {
    for (const [lz, leanX] of [
      [0.3, 0.22],
      [-0.32, -0.22],
    ] as const) {
      const thigh = new RoundedBoxGeometry(0.18, 0.3, 0.2, 2, 0.04);
      thigh.rotateX(leanX);
      thigh.translate(side * 0.4, -0.02, lz);
      parts.push(colorizePart(thigh, 0xcbd5e1));

      const shin = new RoundedBoxGeometry(0.15, 0.26, 0.17, 2, 0.03);
      shin.translate(side * 0.42, -0.26, lz + leanX * 0.25);
      parts.push(colorizePart(shin, 0x1e293b));
    }
  }

  return mergeColoredParts(parts);
}

/**
 * 3. Void Rune Archon (Ranged):
 * Tapered hourglass battle-mage robe, dark cowled hood with cyan eyes, gold wing-mantle collar,
 * 3 floating dorsal crystal shards, and ornate Astral Staff.
 */
function buildVoidConstructGeometry(): THREE.BufferGeometry {
  const robe = loftedProfile(
    [
      [-0.44, 0.42, 0.36],
      [-0.12, 0.28, 0.25],
      [0.14, 0.19, 0.18],
      [0.38, 0.34, 0.27],
      [0.5, 0.26, 0.22],
    ],
    10
  );

  const belt = new RoundedBoxGeometry(0.44, 0.12, 0.4, 2, 0.03);
  belt.translate(0, 0.14, 0);

  const collarWing = extrudeShape(
    [
      [-0.56, 0.18],
      [-0.26, -0.06],
      [0.26, -0.06],
      [0.56, 0.18],
      [0.36, 0.36],
      [0, 0.14],
      [-0.36, 0.36],
    ],
    0.1,
    0.02
  );
  collarWing.translate(0, 0.56, -0.08);

  const cowl = loftedProfile(
    [
      [0.48, 0.22, 0.22],
      [0.64, 0.27, 0.28],
      [0.84, 0.21, 0.24, 0, -0.02],
      [0.94, 0.09, 0.12, 0, -0.04],
    ],
    10
  );

  const hoodShadow = new RoundedBoxGeometry(0.28, 0.22, 0.16, 2, 0.04);
  hoodShadow.translate(0, 0.68, 0.18);

  const eyeL = new RoundedBoxGeometry(0.08, 0.045, 0.08, 1, 0.01);
  eyeL.translate(-0.075, 0.69, 0.26);
  const eyeR = new RoundedBoxGeometry(0.08, 0.045, 0.08, 1, 0.01);
  eyeR.translate(0.075, 0.69, 0.26);

  // Dorsal floating arcane crystal shards
  const shardC = new THREE.OctahedronGeometry(0.14, 0);
  shardC.scale(0.6, 1.45, 0.45);
  shardC.translate(0, 0.96, -0.26);

  const shardL = new THREE.OctahedronGeometry(0.11, 0);
  shardL.scale(0.6, 1.4, 0.45);
  shardL.rotateZ(0.45);
  shardL.translate(-0.32, 0.86, -0.24);

  const shardR = new THREE.OctahedronGeometry(0.11, 0);
  shardR.scale(0.6, 1.4, 0.45);
  shardR.rotateZ(-0.45);
  shardR.translate(0.32, 0.86, -0.24);

  // Forward Astral Casting Staff + Cradle + Core Crystal
  const staff = new RoundedBoxGeometry(0.07, 1.12, 0.07, 1, 0.015);
  staff.rotateX(0.32);
  staff.translate(0.4, 0.44, 0.22);

  const staffRing = extrudeShape(
    [
      [-0.14, 0],
      [-0.08, -0.1],
      [0.08, -0.1],
      [0.14, 0],
      [0.09, 0.16],
      [-0.09, 0.16],
    ],
    0.05,
    0.01
  );
  staffRing.rotateX(0.25);
  staffRing.translate(0.4, 0.92, 0.36);

  const coreOrb = new THREE.OctahedronGeometry(0.13, 0);
  coreOrb.scale(0.85, 1.25, 0.85);
  coreOrb.translate(0.4, 1.0, 0.4);

  return mergeColoredParts([
    colorizePart(robe, 0xffffff),
    colorizePart(belt, 0x1e293b),
    colorizePart(collarWing, 0xfbbf24),
    colorizePart(cowl, 0xe2e8f0),
    colorizePart(hoodShadow, 0x1e293b),
    colorizePart(eyeL, 0x38bdf8),
    colorizePart(eyeR, 0x38bdf8),
    colorizePart(shardC, 0xfbbf24),
    colorizePart(shardL, 0x38bdf8),
    colorizePart(shardR, 0x38bdf8),
    colorizePart(staff, 0x1e293b),
    colorizePart(staffRing, 0xfbbf24),
    colorizePart(coreOrb, 0x38bdf8),
  ]);
}

/**
 * 4. Articulated Heavy War Golem (Elite):
 * V-tapered armored titan hull, dark steel joints, pistoned legs with gold knee-spikes,
 * multi-layered pauldrons, left forearm buckler & right arm wielding an extruded War-Cleaver.
 */
function buildWarGolemEliteGeometry(): THREE.BufferGeometry {
  const pelvis = new RoundedBoxGeometry(0.62, 0.22, 0.42, 2, 0.05);
  pelvis.translate(0, -0.02, 0);

  const torso = loftedProfile(
    [
      [0.02, 0.3, 0.24],
      [0.24, 0.46, 0.34],
      [0.54, 0.56, 0.4],
      [0.68, 0.44, 0.32],
    ],
    10
  );

  const chestPlate = new RoundedBoxGeometry(0.68, 0.38, 0.24, 2, 0.06);
  chestPlate.translate(0, 0.42, 0.26);

  const furnace = extrudeShape(
    [
      [0, 0.18],
      [0.15, 0],
      [0, -0.18],
      [-0.15, 0],
    ],
    0.08,
    0.015
  );
  furnace.translate(0, 0.42, 0.4);

  const helm = new RoundedBoxGeometry(0.46, 0.38, 0.42, 2, 0.08);
  helm.translate(0, 0.88, 0.04);

  const faceSlit = new RoundedBoxGeometry(0.36, 0.14, 0.12, 1, 0.03);
  faceSlit.translate(0, 0.86, 0.22);

  const visor = new RoundedBoxGeometry(0.28, 0.07, 0.08, 1, 0.015);
  visor.translate(0, 0.86, 0.27);

  // Heavy extruded Great-Cleaver held forward in right hand
  const axeShaft = new RoundedBoxGeometry(0.09, 1.15, 0.09, 1, 0.02);
  axeShaft.rotateX(Math.PI * 0.38);
  axeShaft.translate(0.7, 0.34, 0.52);

  const axeBlade = extrudeShape(
    [
      [0, -0.18],
      [0.36, -0.28],
      [0.44, 0.18],
      [0.1, 0.34],
      [-0.08, 0.16],
    ],
    0.07,
    0.018
  );
  axeBlade.rotateY(Math.PI * 0.5);
  axeBlade.translate(0.7, 0.46, 0.94);

  // Left forearm buckler
  const buckler = extrudeShape(
    [
      [-0.2, 0.24],
      [0.2, 0.24],
      [0.24, -0.04],
      [0, -0.3],
      [-0.24, -0.04],
    ],
    0.07,
    0.018
  );
  buckler.rotateY(-0.5);
  buckler.translate(-0.74, 0.24, 0.28);

  const parts: THREE.BufferGeometry[] = [
    colorizePart(pelvis, 0x1e293b),
    colorizePart(torso, 0xffffff),
    colorizePart(chestPlate, 0xe2e8f0),
    colorizePart(furnace, 0xfbbf24),
    colorizePart(helm, 0xdbe4ee),
    colorizePart(faceSlit, 0x1e293b),
    colorizePart(visor, 0xfbbf24),
    colorizePart(axeShaft, 0x1e293b),
    colorizePart(axeBlade, 0x38bdf8),
    colorizePart(buckler, 0xfbbf24),
  ];

  for (const side of [-1, 1]) {
    const leg = new RoundedBoxGeometry(0.24, 0.48, 0.28, 2, 0.05);
    leg.translate(side * 0.24, -0.24, 0);
    parts.push(colorizePart(leg, 0x94a3b8));

    const knee = new RoundedBoxGeometry(0.18, 0.16, 0.12, 1, 0.03);
    knee.translate(side * 0.24, -0.14, 0.15);
    parts.push(colorizePart(knee, 0xfbbf24));

    const pauldron = new RoundedBoxGeometry(0.4, 0.34, 0.44, 2, 0.08);
    pauldron.rotateZ(side * -0.28);
    pauldron.translate(side * 0.64, 0.62, 0);
    parts.push(colorizePart(pauldron, 0xcbd5e1));

    const horn = extrudeShape(
      [
        [0, 0],
        [0.14, 0.12],
        [0.18, 0.42],
        [0.02, 0.22],
      ],
      0.06,
      0.012
    );
    horn.rotateY(side > 0 ? 0.2 : Math.PI - 0.2);
    horn.translate(side * 0.26, 1.0, 0.04);
    parts.push(colorizePart(horn, 0xfbbf24));

    const arm = new RoundedBoxGeometry(0.22, 0.5, 0.24, 2, 0.05);
    arm.rotateX(-0.35);
    arm.translate(side * 0.66, 0.24, 0.18);
    parts.push(colorizePart(arm, 0x1e293b));
  }

  return mergeColoredParts(parts);
}

/**
 * 5. Heavy Shield Vanguard (Shield Lancer — NO cylinder body/shield!):
 * Knight positioned at z = -0.14 in wide-stance greaves, sculpted cuirass, layered pauldrons,
 * visored greathelm, holding a forward-mounted beveled octagonal/kite Tower Shield + heavy War-Halberd.
 */
function buildShieldVanguardGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // 1. Armored Knight Torso & Helmet (offset slightly back behind shield at z = -0.14)
  const cuirass = loftedProfile(
    [
      [-0.04, 0.24, 0.2, 0, -0.14],
      [0.18, 0.32, 0.26, 0, -0.14],
      [0.48, 0.4, 0.3, 0, -0.12],
      [0.62, 0.3, 0.24, 0, -0.12],
    ],
    10
  );
  const belt = new RoundedBoxGeometry(0.5, 0.12, 0.42, 2, 0.03);
  belt.translate(0, 0.02, -0.14);

  const helm = new RoundedBoxGeometry(0.4, 0.36, 0.38, 2, 0.08);
  helm.translate(0, 0.8, -0.1);

  const visorRecess = new RoundedBoxGeometry(0.32, 0.14, 0.12, 1, 0.025);
  visorRecess.translate(0, 0.78, 0.06);

  const visorGlow = new RoundedBoxGeometry(0.24, 0.065, 0.08, 1, 0.015);
  visorGlow.translate(0, 0.78, 0.1);

  parts.push(
    colorizePart(cuirass, 0xffffff),
    colorizePart(belt, 0x1e293b),
    colorizePart(helm, 0xdbe4ee),
    colorizePart(visorRecess, 0x1e293b),
    colorizePart(visorGlow, 0x38bdf8)
  );

  for (const side of [-1, 1]) {
    const leg = new RoundedBoxGeometry(0.2, 0.46, 0.24, 2, 0.045);
    leg.translate(side * 0.22, -0.22, -0.14);
    parts.push(colorizePart(leg, 0x94a3b8));

    const knee = new RoundedBoxGeometry(0.14, 0.14, 0.12, 1, 0.025);
    knee.translate(side * 0.22, -0.12, -0.02);
    parts.push(colorizePart(knee, 0xfbbf24));

    const pauldron = new RoundedBoxGeometry(0.3, 0.26, 0.36, 2, 0.07);
    pauldron.rotateZ(side * -0.32);
    pauldron.translate(side * 0.46, 0.52, -0.1);
    parts.push(colorizePart(pauldron, 0xfbbf24));

    // Side helm wing fins (swept silhouette instead of a vertical hat cone)
    const fin = extrudeShape(
      [
        [0, 0],
        [0.18, 0.16],
        [0.06, 0.34],
        [-0.04, 0.12],
      ],
      0.045,
      0.01
    );
    fin.rotateY(Math.PI * 0.5);
    fin.rotateZ(side * -0.25);
    fin.translate(side * 0.24, 0.86, -0.12);
    parts.push(colorizePart(fin, 0x38bdf8));
  }

  // 2. Forward-Held Sculpted Octagonal Kite Tower Shield (x = -0.12, z = +0.40)
  const shieldFrame = extrudeShape(
    [
      [-0.36, 0.48],
      [0.36, 0.48],
      [0.44, 0.22],
      [0.32, -0.32],
      [0, -0.54],
      [-0.32, -0.32],
      [-0.44, 0.22],
    ],
    0.09,
    0.024
  );
  shieldFrame.translate(-0.1, 0.26, 0.38);

  const shieldFace = extrudeShape(
    [
      [-0.28, 0.4],
      [0.28, 0.4],
      [0.35, 0.18],
      [0.24, -0.26],
      [0, -0.44],
      [-0.24, -0.26],
      [-0.35, 0.18],
    ],
    0.05,
    0.015
  );
  shieldFace.translate(-0.1, 0.26, 0.44);

  const shieldTrim = extrudeShape(
    [
      [0, 0.26],
      [0.18, 0.04],
      [0, -0.26],
      [-0.18, 0.04],
    ],
    0.04,
    0.012
  );
  shieldTrim.translate(-0.1, 0.28, 0.48);

  const shieldCore = new THREE.OctahedronGeometry(0.14, 0);
  shieldCore.scale(0.8, 1.35, 0.45);
  shieldCore.translate(-0.1, 0.28, 0.52);

  parts.push(
    colorizePart(shieldFrame, 0x1e293b),
    colorizePart(shieldFace, 0xe2e8f0),
    colorizePart(shieldTrim, 0xfbbf24),
    colorizePart(shieldCore, 0x38bdf8)
  );

  // 3. Right-Arm Heavy War-Halberd projecting forward
  const armR = new RoundedBoxGeometry(0.18, 0.4, 0.2, 2, 0.04);
  armR.rotateX(-0.55);
  armR.translate(0.46, 0.28, 0.1);

  const lanceShaft = new RoundedBoxGeometry(0.065, 1.18, 0.065, 1, 0.015);
  lanceShaft.rotateX(Math.PI * 0.44);
  lanceShaft.translate(0.48, 0.3, 0.46);

  const crossGuard = new RoundedBoxGeometry(0.24, 0.08, 0.08, 1, 0.02);
  crossGuard.translate(0.48, 0.34, 0.74);

  const halberdHead = extrudeShape(
    [
      [0, 0],
      [0.16, 0.22],
      [0.06, 0.56],
      [-0.08, 0.24],
    ],
    0.045,
    0.012
  );
  halberdHead.rotateY(Math.PI * 0.5);
  halberdHead.rotateX(Math.PI * 0.44);
  halberdHead.translate(0.48, 0.38, 0.94);

  parts.push(
    colorizePart(armR, 0x1e293b),
    colorizePart(lanceShaft, 0x1e293b),
    colorizePart(crossGuard, 0xfbbf24),
    colorizePart(halberdHead, 0x38bdf8)
  );

  return mergeColoredParts(parts);
}

/**
 * Elongated aerodynamic plasma energy lance geometry aligned along +Z.
 */
function buildPlasmaLanceGeometry(): THREE.BufferGeometry {
  const tip = new THREE.ConeGeometry(0.18, 0.65, 5);
  tip.rotateX(Math.PI / 2);
  tip.translate(0, 0, 0.28);
  const tail = new THREE.ConeGeometry(0.18, 0.95, 5);
  tail.rotateX(-Math.PI / 2);
  tail.translate(0, 0, -0.52);
  const merged = mergeGeometries([tip, tail], false);
  tip.dispose();
  tail.dispose();
  return merged;
}

/**
 * Creates a reusable 7-segment crossed lightning ribbon geometry (zero per-frame allocations).
 */
const LIGHTNING_SEGMENTS = 7;
function createDynamicLightningRibbon(): {
  mesh: THREE.Mesh;
  geo: THREE.BufferGeometry;
  mat: THREE.MeshBasicMaterial;
  positions: Float32Array;
} {
  const vertCount = (LIGHTNING_SEGMENTS + 1) * 2;
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const indices: number[] = [];

  for (let i = 0; i <= LIGHTNING_SEGMENTS; i += 1) {
    const u = i / LIGHTNING_SEGMENTS;
    uvs[i * 4] = u;
    uvs[i * 4 + 1] = 0;
    uvs[i * 4 + 2] = u;
    uvs[i * 4 + 3] = 1;
    if (i < LIGHTNING_SEGMENTS) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  const mat = new THREE.MeshBasicMaterial({
    map: getVfxTrailTexture(),
    color: 0x7dd3fc,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 14;
  return { mesh, geo, mat, positions };
}

export class EntityRenderer {
  private readonly slimeInstanced: THREE.InstancedMesh;
  private readonly boarInstanced: THREE.InstancedMesh;
  private readonly mageInstanced: THREE.InstancedMesh;
  private readonly eliteInstanced: THREE.InstancedMesh;
  private readonly shieldInstanced: THREE.InstancedMesh;
  private readonly telegraphInstanced: THREE.InstancedMesh;
  private readonly playerProjInstanced: THREE.InstancedMesh;
  private readonly playerProjGlowInstanced: THREE.InstancedMesh;
  private readonly enemyProjInstanced: THREE.InstancedMesh;
  private readonly enemyProjGlowInstanced: THREE.InstancedMesh;
  private readonly dropInstanced: THREE.InstancedMesh;
  private readonly dropGlowInstanced: THREE.InstancedMesh;
  private readonly vfxInstanced: THREE.InstancedMesh;

  // Pooled dynamic glowing VFX (zero GC in sync)
  private readonly lightningPool: Array<{
    mesh: THREE.Mesh;
    geo: THREE.BufferGeometry;
    mat: THREE.MeshBasicMaterial;
    positions: Float32Array;
  }> = [];
  private readonly laserPool: Array<{
    group: THREE.Group;
    coreMat: THREE.MeshBasicMaterial;
    haloMat: THREE.MeshBasicMaterial;
  }> = [];
  private readonly shockwavePool: Array<{
    mesh: THREE.Mesh;
    mat: THREE.ShaderMaterial;
  }> = [];
  private readonly starfallPillars: Array<{
    mesh: THREE.Mesh;
    mat: THREE.ShaderMaterial;
  }> = [];

  private readonly bossGroup: THREE.Group;
  private readonly bossBodyMat: THREE.MeshStandardMaterial;
  private readonly bossWeaponPivot: THREE.Group;
  private readonly bossWingsPivot: THREE.Group;
  private readonly bossSlamRing: THREE.Mesh;
  private readonly bossSlamFill: THREE.Mesh;

  private readonly supplyGroup: THREE.Group;
  private readonly supplyRing: THREE.Mesh;
  private readonly supplyPillarMat: THREE.ShaderMaterial;
  private readonly gateGroups: [THREE.Group, THREE.Group];
  private readonly gateMaterials: [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial];
  private readonly gateBeamMaterials: [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial];
  private readonly gateTextures: [THREE.CanvasTexture, THREE.CanvasTexture];
  private readonly gateLabels: Array<{
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    tex: THREE.CanvasTexture;
    lastKey: string;
  }>;

  private readonly scene: THREE.Scene;
  private readonly managedObjects: THREE.Object3D[] = [];
  private readonly disposables: Array<{ dispose: () => void }> = [];
  private readonly dummyObj = new THREE.Object3D();
  private readonly tmpColor = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    const caps = RUNTIME_CONFIG.defaultPoolCapacities;
    const enemyMat = this.track(
      applyFresnelRim(
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.36,
          metalness: 0.34,
        }),
        0x93c5fd,
        2.7,
        0.58
      )
    );

    const makeEnemyMesh = (geo: THREE.BufferGeometry, maxCount: number) => {
      this.track(geo);
      const mesh = this.track(new THREE.InstancedMesh(geo, enemyMat, maxCount));
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.addManaged(mesh);
      return mesh;
    };

    this.slimeInstanced = makeEnemyMesh(buildRiftStalkerGeometry(), caps.enemies);
    this.boarInstanced = makeEnemyMesh(buildRavagerBeastGeometry(), 80);
    this.mageInstanced = makeEnemyMesh(buildVoidConstructGeometry(), 80);
    this.eliteInstanced = makeEnemyMesh(buildWarGolemEliteGeometry(), 24);
    this.shieldInstanced = makeEnemyMesh(buildShieldVanguardGeometry(), 48);

    // Charger/Boss dash telegraph lines (additive warning beam)
    const teleGeo = this.track(new THREE.PlaneGeometry(0.85, 1.0));
    teleGeo.rotateX(-Math.PI / 2);
    const teleMat = this.track(
      new THREE.MeshBasicMaterial({
        color: 0xff3b5c,
        transparent: true,
        opacity: 0.54,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.telegraphInstanced = this.track(new THREE.InstancedMesh(teleGeo, teleMat, 40));
    this.telegraphInstanced.count = 0;
    this.telegraphInstanced.frustumCulled = false;
    this.addManaged(this.telegraphInstanced);

    // Player Projectiles: Sleek velocity-aligned plasma lances + Additive outer glow halos
    const pProjGeo = this.track(buildPlasmaLanceGeometry());
    const pProjMat = this.track(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.playerProjInstanced = this.track(
      new THREE.InstancedMesh(pProjGeo, pProjMat, caps.playerProjectiles)
    );
    this.playerProjInstanced.count = 0;
    this.playerProjInstanced.frustumCulled = false;
    this.addManaged(this.playerProjInstanced);

    const glowPlaneGeo = this.track(new THREE.PlaneGeometry(1, 1));
    glowPlaneGeo.rotateX(-Math.PI / 2);
    const pGlowMat = this.track(
      new THREE.MeshBasicMaterial({
        map: getVfxGlowTexture(),
        color: 0xffffff,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.playerProjGlowInstanced = this.track(
      new THREE.InstancedMesh(glowPlaneGeo, pGlowMat, caps.playerProjectiles)
    );
    this.playerProjGlowInstanced.count = 0;
    this.playerProjGlowInstanced.frustumCulled = false;
    this.addManaged(this.playerProjGlowInstanced);

    // Enemy Projectiles: glowing crimson plasma orbs + additive aura
    const eProjGeo = this.track(new THREE.OctahedronGeometry(0.28, 1));
    const eProjMat = this.track(new THREE.MeshBasicMaterial({ color: 0xffe4e6 }));
    this.enemyProjInstanced = this.track(
      new THREE.InstancedMesh(eProjGeo, eProjMat, caps.enemyProjectiles)
    );
    this.enemyProjInstanced.count = 0;
    this.enemyProjInstanced.frustumCulled = false;
    this.addManaged(this.enemyProjInstanced);

    const eGlowMat = this.track(
      new THREE.MeshBasicMaterial({
        map: getVfxGlowTexture(),
        color: 0xff2a55,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.enemyProjGlowInstanced = this.track(
      new THREE.InstancedMesh(glowPlaneGeo, eGlowMat, caps.enemyProjectiles)
    );
    this.enemyProjGlowInstanced.count = 0;
    this.enemyProjGlowInstanced.frustumCulled = false;
    this.addManaged(this.enemyProjGlowInstanced);

    // XP Drops: sharp glowing energy crystal prisms + soft additive aura
    const dropGeo = this.track(new THREE.OctahedronGeometry(0.22, 0));
    dropGeo.scale(0.75, 1.55, 0.75);
    const dropMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x1e3a5f,
        emissiveIntensity: 0.7,
        roughness: 0.15,
        metalness: 0.65,
      })
    );
    this.dropInstanced = this.track(new THREE.InstancedMesh(dropGeo, dropMat, caps.drops));
    this.dropInstanced.count = 0;
    this.dropInstanced.frustumCulled = false;
    this.addManaged(this.dropInstanced);

    const dropGlowMat = this.track(
      new THREE.MeshBasicMaterial({
        map: getVfxGlowTexture(),
        color: 0xffffff,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.dropGlowInstanced = this.track(
      new THREE.InstancedMesh(glowPlaneGeo, dropGlowMat, caps.drops)
    );
    this.dropGlowInstanced.count = 0;
    this.dropGlowInstanced.frustumCulled = false;
    this.addManaged(this.dropGlowInstanced);

    // VFX Particles: Additive stretched diamond sparks (NO matte BoxGeometry!)
    const vfxGeo = this.track(new THREE.OctahedronGeometry(0.22, 0));
    vfxGeo.scale(0.5, 0.5, 2.2);
    const vfxMat = this.track(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.vfxInstanced = this.track(new THREE.InstancedMesh(vfxGeo, vfxMat, caps.vfx));
    this.vfxInstanced.count = 0;
    this.vfxInstanced.frustumCulled = false;
    this.addManaged(this.vfxInstanced);

    // Pooled Dynamic Jagged Lightning Ribbons (24 slots for Thunder Arc chains)
    for (let i = 0; i < 24; i += 1) {
      const bolt = createDynamicLightningRibbon();
      this.track(bolt.geo);
      this.track(bolt.mat);
      this.addManaged(bolt.mesh);
      this.lightningPool.push(bolt);
    }

    // Pooled Laser & Dash Afterimage Beams (12 slots, crossed horizontal+vertical glowing ribbons)
    const beamUnitGeoH = this.track(new THREE.PlaneGeometry(1, 1));
    beamUnitGeoH.rotateX(-Math.PI / 2);
    beamUnitGeoH.rotateY(-Math.PI / 2);
    const beamUnitGeoV = this.track(new THREE.PlaneGeometry(1, 1));
    beamUnitGeoV.rotateY(-Math.PI / 2);
    const trailTex = getVfxTrailTexture();
    for (let i = 0; i < 12; i += 1) {
      const grp = new THREE.Group();
      grp.visible = false;
      const coreMat = this.track(
        new THREE.MeshBasicMaterial({
          map: trailTex,
          color: 0xffffff,
          transparent: true,
          opacity: 0.95,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      const haloMat = this.track(
        new THREE.MeshBasicMaterial({
          map: trailTex,
          color: 0xf43f5e,
          transparent: true,
          opacity: 0.78,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      const coreH = new THREE.Mesh(beamUnitGeoH, coreMat);
      coreH.scale.set(1, 1, 0.36);
      const haloH = new THREE.Mesh(beamUnitGeoH, haloMat);
      const haloV = new THREE.Mesh(beamUnitGeoV, haloMat);
      grp.add(haloH, haloV, coreH);
      grp.renderOrder = 15;
      this.addManaged(grp);
      this.laserPool.push({ group: grp, coreMat, haloMat });
    }

    // Pooled Custom GLSL Ground Shockwaves (12 slots)
    const swGeo = this.track(new THREE.PlaneGeometry(2, 2));
    swGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 12; i += 1) {
      const mat = this.track(createShockwaveShaderMaterial());
      const mesh = new THREE.Mesh(swGeo, mat);
      mesh.position.y = 0.09;
      mesh.visible = false;
      mesh.renderOrder = 13;
      this.addManaged(mesh);
      this.shockwavePool.push({ mesh, mat });
    }

    // Pooled Celestial Starfall Vertical Pillars (2 slots for Fury Ultimate / Century Burst)
    const sfGeo = this.track(new THREE.CylinderGeometry(0.65, 2.1, 15, 16, 1, true));
    for (let i = 0; i < 2; i += 1) {
      const mat = this.track(createBeaconPillarMaterial(0xfbbf24, 0.92));
      const mesh = new THREE.Mesh(sfGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 16;
      this.addManaged(mesh);
      this.starfallPillars.push({ mesh, mat });
    }

    // Towering Articulated 3D Dread Titan Lord Boss
    this.bossGroup = new THREE.Group();
    this.bossGroup.visible = false;

    const shadowTex = this.track(createContactShadowTexture());
    const bShadowGeo = this.track(new THREE.PlaneGeometry(4.8, 4.8));
    bShadowGeo.rotateX(-Math.PI / 2);
    const bShadowMat = this.track(
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
    );
    const bShadow = new THREE.Mesh(bShadowGeo, bShadowMat);
    bShadow.position.y = 0.03;
    this.bossGroup.add(bShadow);

    this.bossBodyMat = this.track(
      applyFresnelRim(
        new THREE.MeshStandardMaterial({
          color: 0x991b1b,
          roughness: 0.28,
          metalness: 0.72,
        }),
        0xf97316,
        2.3,
        0.8
      )
    );
    const bossArmorDark = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.36,
        metalness: 0.82,
      })
    );
    const bossGoldMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0x92400e,
        emissiveIntensity: 0.45,
        metalness: 0.85,
        roughness: 0.22,
      })
    );
    const bossCoreMat = this.track(new THREE.MeshBasicMaterial({ color: 0xffd166 }));

    // 1. Two Heavy Armored Titan Legs & Pelvis
    const thighGeo = this.track(new THREE.CylinderGeometry(0.32, 0.28, 0.62, 6));
    const greaveGeo = this.track(new THREE.CylinderGeometry(0.34, 0.42, 0.72, 6));
    const kneeGeo = this.track(new THREE.OctahedronGeometry(0.24, 0));
    for (const side of [-1, 1]) {
      const legGrp = new THREE.Group();
      legGrp.position.set(side * 0.56, 0, 0);
      const thigh = new THREE.Mesh(thighGeo, bossArmorDark);
      thigh.position.y = 0.95;
      legGrp.add(thigh);
      const greave = new THREE.Mesh(greaveGeo, this.bossBodyMat);
      greave.position.y = 0.38;
      greave.castShadow = true;
      legGrp.add(greave);
      const knee = new THREE.Mesh(kneeGeo, bossGoldMat);
      knee.position.set(0, 0.72, 0.28);
      legGrp.add(knee);
      this.bossGroup.add(legGrp);
    }

    const waist = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.78, 0.72, 0.42, 6)),
      bossArmorDark
    );
    waist.position.y = 1.32;
    this.bossGroup.add(waist);

    // 2. Sculpted Multi-Layered V-Tapered Breastplate + Proportional Furnace Core
    const bossTorso = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(1.22, 0.76, 1.48, 6)),
      this.bossBodyMat
    );
    bossTorso.position.y = 2.18;
    bossTorso.castShadow = true;
    this.bossGroup.add(bossTorso);

    const chestBevel = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.95, 0.65, 0.88, 6)),
      bossArmorDark
    );
    chestBevel.position.set(0, 2.26, 0.26);
    this.bossGroup.add(chestBevel);

    const bossChestCore = new THREE.Mesh(
      this.track(new THREE.OctahedronGeometry(0.3, 0)),
      bossCoreMat
    );
    bossChestCore.scale.set(0.95, 1.35, 0.5);
    bossChestCore.position.set(0, 2.26, 0.92);
    this.bossGroup.add(bossChestCore);

    const bossCoreGlow = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(1.15, 1.15)),
      this.track(
        new THREE.MeshBasicMaterial({
          map: getVfxGlowTexture(),
          color: 0xf97316,
          transparent: true,
          opacity: 0.72,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      )
    );
    bossCoreGlow.position.set(0, 2.26, 1.06);
    this.bossGroup.add(bossCoreGlow);

    // 3. Curved Multi-Tiered Titan Shoulder Pauldrons + Blade Fins (NO rectangular bricks)
    const pauldronDomeGeo = this.track(new THREE.CylinderGeometry(0.54, 0.7, 0.78, 6));
    const pauldronCapGeo = this.track(new THREE.ConeGeometry(0.42, 0.72, 4));
    for (const side of [-1, 1]) {
      const pGrp = new THREE.Group();
      pGrp.position.set(side * 1.42, 2.75, 0);
      pGrp.rotation.z = -side * 0.42;

      const dome = new THREE.Mesh(pauldronDomeGeo, this.bossBodyMat);
      dome.castShadow = true;
      pGrp.add(dome);

      const trim = new THREE.Mesh(
        this.track(new THREE.TorusGeometry(0.58, 0.08, 6, 6)),
        bossGoldMat
      );
      trim.rotation.x = Math.PI / 2;
      trim.position.y = 0.28;
      pGrp.add(trim);

      const bladeFin = new THREE.Mesh(pauldronCapGeo, bossGoldMat);
      bladeFin.position.set(side * 0.14, 0.56, 0);
      bladeFin.rotation.z = -side * 0.35;
      pGrp.add(bladeFin);

      this.bossGroup.add(pGrp);
    }

    // 4. Left Armored Claw Arm + Right Articulated War-Halberd Arm
    const leftArm = new THREE.Group();
    leftArm.position.set(-1.38, 2.18, 0.12);
    const upperArm = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.24, 0.2, 0.78, 6)),
      bossArmorDark
    );
    upperArm.position.y = -0.3;
    leftArm.add(upperArm);
    const gauntlet = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.28, 0.34, 0.68, 6)),
      this.bossBodyMat
    );
    gauntlet.position.set(0, -0.82, 0.18);
    gauntlet.rotation.x = -0.35;
    leftArm.add(gauntlet);
    this.bossGroup.add(leftArm);

    this.bossWeaponPivot = new THREE.Group();
    this.bossWeaponPivot.position.set(1.42, 2.22, 0.14);
    const rArm = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.24, 0.22, 0.85, 6)),
      bossArmorDark
    );
    rArm.position.set(0, -0.34, 0.12);
    rArm.rotation.x = -0.3;
    this.bossWeaponPivot.add(rArm);

    // Giant Glowing Void War-Halberd
    const halberdShaft = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.08, 0.08, 3.8, 6)),
      bossArmorDark
    );
    halberdShaft.rotation.x = Math.PI * 0.38;
    halberdShaft.position.set(0.08, -0.35, 1.05);
    this.bossWeaponPivot.add(halberdShaft);

    const halberdBlade = new THREE.Mesh(
      this.track(new THREE.OctahedronGeometry(0.48, 0)),
      this.track(
        new THREE.MeshStandardMaterial({
          color: 0xfef08a,
          emissive: 0xf97316,
          emissiveIntensity: 1.4,
          roughness: 0.15,
          metalness: 0.85,
        })
      )
    );
    halberdBlade.scale.set(0.28, 0.95, 2.15);
    halberdBlade.rotation.x = Math.PI * 0.38;
    halberdBlade.position.set(0.08, -1.02, 2.72);
    this.bossWeaponPivot.add(halberdBlade);
    this.bossGroup.add(this.bossWeaponPivot);

    // 5. Armored Horned Sovereign Helm + Glowing Visor
    const bHelm = new THREE.Mesh(
      this.track(new THREE.OctahedronGeometry(0.62, 0)),
      bossArmorDark
    );
    bHelm.position.set(0, 3.25, 0.12);
    bHelm.castShadow = true;
    this.bossGroup.add(bHelm);

    const bVisor = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(0.66, 0.12, 0.2)),
      bossCoreMat
    );
    bVisor.position.set(0, 3.22, 0.62);
    this.bossGroup.add(bVisor);

    const hornGeo = this.track(new THREE.ConeGeometry(0.18, 1.05, 4));
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(hornGeo, bossGoldMat);
      horn.position.set(side * 0.62, 3.68, 0.05);
      horn.rotation.z = -side * 0.55;
      this.bossGroup.add(horn);
    }

    // 6. Twin Angled Dorsal Energy Wings (replaces flat pink torus)
    this.bossWingsPivot = new THREE.Group();
    this.bossWingsPivot.position.set(0, 2.48, -0.78);
    const wingBladeGeo = this.track(new THREE.ConeGeometry(0.38, 2.6, 4));
    wingBladeGeo.scale(0.28, 1, 1.3);
    const wingMat = this.track(
      new THREE.MeshBasicMaterial({
        color: 0xf43f5e,
        transparent: true,
        opacity: 0.82,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    for (const side of [-1, 1]) {
      const wBlade = new THREE.Mesh(wingBladeGeo, wingMat);
      wBlade.position.set(side * 1.45, 0.45, -0.25);
      wBlade.rotation.set(-0.32, side * 0.2, -side * 0.92);
      this.bossWingsPivot.add(wBlade);
    }
    this.bossGroup.add(this.bossWingsPivot);
    scene.add(this.bossGroup);

    const slamRingGeo = this.track(new THREE.RingGeometry(0.9, 1.0, 44));
    slamRingGeo.rotateX(-Math.PI / 2);
    const slamRingMat = this.track(
      new THREE.MeshBasicMaterial({
        color: 0xff3838,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.bossSlamRing = new THREE.Mesh(slamRingGeo, slamRingMat);
    this.bossSlamRing.position.y = 0.07;
    this.bossSlamRing.visible = false;
    scene.add(this.bossSlamRing);

    const slamFillGeo = this.track(new THREE.CircleGeometry(1.0, 44));
    slamFillGeo.rotateX(-Math.PI / 2);
    const slamFillMat = this.track(
      new THREE.MeshBasicMaterial({
        color: 0xff3838,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.bossSlamFill = new THREE.Mesh(slamFillGeo, slamFillMat);
    this.bossSlamFill.position.y = 0.06;
    this.bossSlamFill.visible = false;
    scene.add(this.bossSlamFill);

    // Sci-Fi Supply Drop Pod + Holographic Sky Beacon Pillar
    const supplyProp = createSupplyCrateProp();
    this.supplyGroup = supplyProp.group;
    this.supplyRing = supplyProp.ring;
    this.supplyPillarMat = supplyProp.pillarMat;
    this.supplyGroup.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if (m.geometry) this.track(m.geometry);
      if (m.material && !Array.isArray(m.material)) this.track(m.material);
    });
    scene.add(this.supplyGroup);

    // Frameless Sci-Fi Holographic Laser Grate Gates (Left / Right)
    const emitterPodMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.65, roughness: 0.25 })
    );
    const podBaseGeo = this.track(new THREE.CylinderGeometry(0.16, 0.24, 0.16, 8));
    const emitterCapGeo = this.track(new THREE.OctahedronGeometry(0.14, 0));
    const fieldGeo = this.track(new THREE.PlaneGeometry(3.86, 1.96));
    const hBeamGeo = this.track(new THREE.CylinderGeometry(0.032, 0.032, 3.92, 8));
    hBeamGeo.rotateZ(Math.PI / 2);
    const edgeBeamGeo = this.track(new THREE.CylinderGeometry(0.038, 0.038, 2.04, 8));

    const makeGateGroup = (hex: number, rgbStr: string) => {
      const g = new THREE.Group();
      g.visible = false;

      const grateTex = this.track(createLaserGrateTexture(rgbStr));
      const fieldMat = this.track(
        new THREE.MeshBasicMaterial({
          map: grateTex,
          color: hex,
          transparent: true,
          opacity: 0.65,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      const beamMat = this.track(
        new THREE.MeshBasicMaterial({
          color: hex,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      const nodeMat = this.track(
        new THREE.MeshStandardMaterial({
          color: hex,
          emissive: hex,
          emissiveIntensity: 1.6,
          roughness: 0.18,
        })
      );

      const fieldMesh = new THREE.Mesh(fieldGeo, fieldMat);
      fieldMesh.position.y = 1.06;
      g.add(fieldMesh);

      const beamHeights = [0.22, 0.64, 1.06, 1.48, 1.92];
      for (const by of beamHeights) {
        const hBeam = new THREE.Mesh(hBeamGeo, beamMat);
        hBeam.position.y = by;
        g.add(hBeam);
      }

      for (const sx of [-1.96, 1.96]) {
        const pod = new THREE.Mesh(podBaseGeo, emitterPodMat);
        pod.position.set(sx, 0.08, 0);
        g.add(pod);

        const crystal = new THREE.Mesh(emitterCapGeo, nodeMat);
        crystal.position.set(sx, 0.24, 0);
        g.add(crystal);

        const edgeBeam = new THREE.Mesh(edgeBeamGeo, beamMat);
        edgeBeam.position.set(sx, 1.08, 0);
        g.add(edgeBeam);
      }

      scene.add(g);
      return { g, fieldMat, beamMat, grateTex };
    };
    const g0 = makeGateGroup(0x0ea5e9, '56, 189, 248');
    const g1 = makeGateGroup(0xf59e0b, '251, 191, 36');
    this.gateGroups = [g0.g, g1.g];
    this.gateMaterials = [g0.fieldMat, g1.fieldMat];
    this.gateBeamMaterials = [g0.beamMat, g1.beamMat];
    this.gateTextures = [g0.grateTex, g1.grateTex];

    this.gateLabels = [0, 1].map((idx) => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 120;
      const ctx = canvas.getContext('2d')!;
      const tex = this.track(new THREE.CanvasTexture(canvas));
      tex.colorSpace = THREE.SRGBColorSpace;
      const spMat = this.track(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      const sprite = new THREE.Sprite(spMat);
      sprite.position.set(0, 2.74, 0);
      sprite.scale.set(3.25, 1.2, 1);
      sprite.renderOrder = 20;
      this.gateGroups[idx].add(sprite);
      return { canvas, ctx, tex, lastKey: '' };
    });
  }

  private addManaged(obj: THREE.Object3D): void {
    this.managedObjects.push(obj);
    this.scene.add(obj);
  }

  private track<T extends { dispose: () => void }>(item: T): T {
    this.disposables.push(item);
    return item;
  }

  private commitInstances(mesh: THREE.InstancedMesh, count: number): void {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  public markTexturesDirty(): void {
    markVfxTexturesDirty();
    for (let i = 0; i < this.gateTextures.length; i += 1) {
      this.gateTextures[i].needsUpdate = true;
    }
    for (let i = 0; i < this.gateLabels.length; i += 1) {
      this.gateLabels[i].tex.needsUpdate = true;
    }
  }

  private resolveTint(e: EnemyEntity): number {
    if (e.hitFlashTimer > 0) return 0xffffff;
    if (e.slowTimer > 0) return 0x74b9ff;
    if (e.aiState === 'telegraph' || e.aiState === 'windup') return 0xfffa65;
    return e.baseColor;
  }

  private updateLightningRibbon(
    bolt: {
      mesh: THREE.Mesh;
      geo: THREE.BufferGeometry;
      mat: THREE.MeshBasicMaterial;
      positions: Float32Array;
    },
    b: VfxBeam,
    simTimeSec: number
  ): void {
    const dx = b.x1 - b.x0;
    const dy = b.y1 - b.y0;
    const dz = b.z1 - b.z0;
    const len = Math.hypot(dx, dz) || 0.001;
    const perpX = -dz / len;
    const perpZ = dx / len;
    const lifeRatio = Math.max(0, Math.min(1, b.lifeSec / Math.max(0.01, b.maxLifeSec)));
    const halfW = b.width * (0.45 + 0.55 * lifeRatio);
    const flicker = Math.floor(simTimeSec * 36);
    const pos = bolt.positions;

    for (let i = 0; i <= LIGHTNING_SEGMENTS; i += 1) {
      const t = i / LIGHTNING_SEGMENTS;
      let jitter = 0;
      let yJitter = 0;
      if (i > 0 && i < LIGHTNING_SEGMENTS) {
        const s = Math.sin(b.seed * 13.7 + i * 5.3 + flicker * 2.9);
        const c = Math.cos(b.seed * 7.1 + i * 8.1 - flicker * 3.7);
        jitter = s * Math.min(0.75, len * 0.14);
        yJitter = c * 0.22;
      }
      const cx = b.x0 + dx * t + perpX * jitter;
      const cy = b.y0 + dy * t + yJitter;
      const cz = b.z0 + dz * t + perpZ * jitter;

      const idx0 = i * 6;
      pos[idx0] = cx - perpX * halfW;
      pos[idx0 + 1] = cy;
      pos[idx0 + 2] = cz - perpZ * halfW;
      pos[idx0 + 3] = cx + perpX * halfW;
      pos[idx0 + 4] = cy;
      pos[idx0 + 5] = cz + perpZ * halfW;
    }

    bolt.geo.attributes.position.needsUpdate = true;
    bolt.mat.color.setHex(b.color);
    bolt.mat.opacity = Math.min(1, lifeRatio * 1.4);
    bolt.mesh.visible = true;
  }

  public sync(
    enemies: ObjectPool<EnemyEntity>,
    playerProjectiles: ObjectPool<ProjectileEntity>,
    enemyProjectiles: ObjectPool<ProjectileEntity>,
    drops: ObjectPool<DropEntity>,
    vfx: ObjectPool<VfxParticle>,
    supply: SupplyCrateState,
    bridgeGates: [BridgeGateState, BridgeGateState],
    simTimeSec: number,
    lang: LanguageCode = 'zh',
    beams?: ObjectPool<VfxBeam>,
    shockwaves?: ObjectPool<VfxShockwave>
  ): void {
    let slimeCount = 0;
    let boarCount = 0;
    let mageCount = 0;
    let eliteCount = 0;
    let shieldCount = 0;
    let teleCount = 0;
    let bossVisible = false;
    let slamTelegraph = false;

    enemies.forEachActive((e) => {
      if (e.isBoss) {
        bossVisible = true;
        this.bossGroup.visible = true;
        this.bossGroup.position.set(e.x, Math.abs(Math.sin(simTimeSec * 3.2)) * 0.09, e.z);
        this.bossGroup.rotation.y = e.facingRad;
        this.bossBodyMat.color.setHex(e.baseColor);
        this.bossWingsPivot.scale.set(1, 1 + Math.sin(simTimeSec * 6) * 0.08, 1);

        if (e.aiState === 'boss-slam-telegraph') {
          this.bossWeaponPivot.rotation.x = -0.95;
        } else {
          this.bossWeaponPivot.rotation.x = Math.sin(simTimeSec * 4.2) * 0.22;
        }

        if (e.hitFlashTimer > 0) {
          this.bossBodyMat.emissive.setHex(0xffffff);
          this.bossBodyMat.emissiveIntensity = 0.85;
        } else if (e.aiState === 'boss-slam-telegraph' || e.aiState === 'boss-dash-telegraph') {
          this.bossBodyMat.emissive.setHex(0xff6b00);
          this.bossBodyMat.emissiveIntensity = 0.7;
        } else {
          this.bossBodyMat.emissive.setHex(0x180408);
          this.bossBodyMat.emissiveIntensity = 0.22;
        }

        if (e.aiState === 'boss-slam-telegraph') {
          slamTelegraph = true;
          this.bossSlamRing.visible = true;
          this.bossSlamRing.position.set(e.slamX, 0.07, e.slamZ);
          this.bossSlamRing.scale.setScalar(e.slamRadius);

          this.bossSlamFill.visible = true;
          this.bossSlamFill.position.set(e.slamX, 0.06, e.slamZ);
          const progress = Math.max(0.05, 1 - e.aiTimer / 1.05);
          this.bossSlamFill.scale.setScalar(e.slamRadius * progress);
        } else if (e.aiState === 'boss-dash-telegraph' && teleCount < 40) {
          const dashLen = 8.5;
          this.dummyObj.position.set(e.x + e.dirX * dashLen * 0.5, 0.06, e.z + e.dirZ * dashLen * 0.5);
          this.dummyObj.rotation.set(0, Math.atan2(e.dirX, e.dirZ), 0);
          this.dummyObj.scale.set(2.2, 1, dashLen);
          this.dummyObj.updateMatrix();
          this.telegraphInstanced.setMatrixAt(teleCount++, this.dummyObj.matrix);
        }
        return;
      }

      const isRangedFloat = e.role === 'ranged';
      const bounce = isRangedFloat
        ? 0.42 + Math.sin(simTimeSec * 4.5 + e.slotIndex) * 0.14
        : Math.abs(Math.sin(simTimeSec * 8.5 + e.slotIndex)) * 0.09 * e.scale;
      this.dummyObj.position.set(e.x, 0.48 * e.scale + bounce, e.z);
      this.dummyObj.rotation.set(0, e.facingRad, 0);
      this.dummyObj.scale.setScalar(e.scale);
      this.dummyObj.updateMatrix();
      this.tmpColor.setHex(this.resolveTint(e));

      if (e.role === 'charger') {
        if (boarCount < this.boarInstanced.instanceMatrix.count) {
          this.boarInstanced.setMatrixAt(boarCount, this.dummyObj.matrix);
          this.boarInstanced.setColorAt(boarCount, this.tmpColor);
          boarCount += 1;
        }
      } else if (e.role === 'ranged') {
        if (mageCount < this.mageInstanced.instanceMatrix.count) {
          this.mageInstanced.setMatrixAt(mageCount, this.dummyObj.matrix);
          this.mageInstanced.setColorAt(mageCount, this.tmpColor);
          mageCount += 1;
        }
      } else if (e.role === 'elite') {
        if (eliteCount < this.eliteInstanced.instanceMatrix.count) {
          this.eliteInstanced.setMatrixAt(eliteCount, this.dummyObj.matrix);
          this.eliteInstanced.setColorAt(eliteCount, this.tmpColor);
          eliteCount += 1;
        }
      } else if (e.armorReduction > 0) {
        if (shieldCount < this.shieldInstanced.instanceMatrix.count) {
          const armorBroken =
            e.debuffTimers[IDX_ARMOR_SHRED] > 0 ||
            e.debuffTimers[IDX_HEAVY_SUNDER] > 0 ||
            e.debuffTimers[IDX_SHOCK_STATIC] > 0;
          if (armorBroken && e.hitFlashTimer <= 0) {
            this.tmpColor.setHex(0xfbbf24);
          }
          this.shieldInstanced.setMatrixAt(shieldCount, this.dummyObj.matrix);
          this.shieldInstanced.setColorAt(shieldCount, this.tmpColor);
          shieldCount += 1;
        }
      } else {
        if (slimeCount < this.slimeInstanced.instanceMatrix.count) {
          this.slimeInstanced.setMatrixAt(slimeCount, this.dummyObj.matrix);
          this.slimeInstanced.setColorAt(slimeCount, this.tmpColor);
          slimeCount += 1;
        }
      }

      if (e.aiState === 'telegraph' && teleCount < 40) {
        const dashLen = 6.2;
        this.dummyObj.position.set(e.x + e.dirX * dashLen * 0.5, 0.06, e.z + e.dirZ * dashLen * 0.5);
        this.dummyObj.rotation.set(0, Math.atan2(e.dirX, e.dirZ), 0);
        this.dummyObj.scale.set(0.95, 1, dashLen);
        this.dummyObj.updateMatrix();
        this.telegraphInstanced.setMatrixAt(teleCount++, this.dummyObj.matrix);
      }
    });

    if (!bossVisible) this.bossGroup.visible = false;
    if (!slamTelegraph) {
      this.bossSlamRing.visible = false;
      this.bossSlamFill.visible = false;
    }

    this.commitInstances(this.slimeInstanced, slimeCount);
    this.commitInstances(this.boarInstanced, boarCount);
    this.commitInstances(this.mageInstanced, mageCount);
    this.commitInstances(this.eliteInstanced, eliteCount);
    this.commitInstances(this.shieldInstanced, shieldCount);

    this.telegraphInstanced.count = teleCount;
    this.telegraphInstanced.instanceMatrix.needsUpdate = true;

    // Player Projectiles: Velocity-oriented glowing plasma lances + additive elongated halos
    let pCount = 0;
    playerProjectiles.forEachActive((p) => {
      if (pCount >= this.playerProjInstanced.instanceMatrix.count) return;
      const yaw = Math.atan2(p.vx, p.vz);
      const sc = p.radius / 0.28;
      this.dummyObj.position.set(p.x, 0.72, p.z);
      this.dummyObj.rotation.set(0, yaw, 0);
      this.dummyObj.scale.set(sc * 0.95, sc * 0.95, sc * 1.45);
      this.dummyObj.updateMatrix();
      this.playerProjInstanced.setMatrixAt(pCount, this.dummyObj.matrix);
      this.tmpColor.setHex(0xffffff);
      this.playerProjInstanced.setColorAt(pCount, this.tmpColor);

      // Elongated additive glow trail centered slightly behind tip
      this.dummyObj.position.set(p.x, 0.72, p.z);
      this.dummyObj.rotation.set(0, yaw, 0);
      this.dummyObj.scale.set(sc * 1.15, 1, sc * 2.45);
      this.dummyObj.updateMatrix();
      this.playerProjGlowInstanced.setMatrixAt(pCount, this.dummyObj.matrix);
      this.tmpColor.setHex(p.color);
      this.playerProjGlowInstanced.setColorAt(pCount, this.tmpColor);
      pCount += 1;
    });
    this.commitInstances(this.playerProjInstanced, pCount);
    this.commitInstances(this.playerProjGlowInstanced, pCount);

    // Enemy Projectiles: glowing crimson orbs + additive outer aura
    let eCount = 0;
    enemyProjectiles.forEachActive((p) => {
      if (eCount >= this.enemyProjInstanced.instanceMatrix.count) return;
      const sc = p.radius / 0.3;
      this.dummyObj.position.set(p.x, 0.7, p.z);
      this.dummyObj.rotation.set(simTimeSec * 5, simTimeSec * 4, 0);
      this.dummyObj.scale.setScalar(sc * 0.85);
      this.dummyObj.updateMatrix();
      this.enemyProjInstanced.setMatrixAt(eCount, this.dummyObj.matrix);

      this.dummyObj.rotation.set(0, 0, 0);
      this.dummyObj.scale.setScalar(sc * 1.65);
      this.dummyObj.updateMatrix();
      this.enemyProjGlowInstanced.setMatrixAt(eCount, this.dummyObj.matrix);
      eCount += 1;
    });
    this.enemyProjInstanced.count = eCount;
    this.enemyProjInstanced.instanceMatrix.needsUpdate = true;
    this.enemyProjGlowInstanced.count = eCount;
    this.enemyProjGlowInstanced.instanceMatrix.needsUpdate = true;

    // XP Drops: Faceted crystal prisms + additive glow halo
    let dCount = 0;
    drops.forEachActive((d) => {
      if (dCount >= this.dropInstanced.instanceMatrix.count) return;
      const bob = Math.sin(simTimeSec * 5 + d.slotIndex) * 0.08;
      const isBig = d.xpValue >= 30;
      const sc = isBig ? 1.45 : 0.96;
      this.dummyObj.position.set(d.x, 0.36 + bob, d.z);
      this.dummyObj.rotation.set(0, simTimeSec * 3.2 + d.slotIndex, 0);
      this.dummyObj.scale.setScalar(sc);
      this.dummyObj.updateMatrix();
      this.dropInstanced.setMatrixAt(dCount, this.dummyObj.matrix);
      this.tmpColor.setHex(d.color);
      this.dropInstanced.setColorAt(dCount, this.tmpColor);

      this.dummyObj.position.set(d.x, 0.14, d.z);
      this.dummyObj.rotation.set(0, 0, 0);
      this.dummyObj.scale.setScalar(isBig ? 1.5 : 0.92);
      this.dummyObj.updateMatrix();
      this.dropGlowInstanced.setMatrixAt(dCount, this.dummyObj.matrix);
      this.dropGlowInstanced.setColorAt(dCount, this.tmpColor);
      dCount += 1;
    });
    this.commitInstances(this.dropInstanced, dCount);
    this.commitInstances(this.dropGlowInstanced, dCount);

    // VFX Particles: Additive velocity-stretched diamond sparks
    let vCount = 0;
    vfx.forEachActive((v) => {
      if (vCount >= this.vfxInstanced.instanceMatrix.count) return;
      const t = Math.max(0, v.lifeSec / v.maxLifeSec);
      const yaw = Math.atan2(v.vx, v.vz);
      this.dummyObj.position.set(v.x, v.y, v.z);
      this.dummyObj.rotation.set(0, yaw, 0);
      this.dummyObj.scale.set(v.scale * t * 1.15, v.scale * t * 1.15, v.scale * (0.8 + t * 1.6));
      this.dummyObj.updateMatrix();
      this.vfxInstanced.setMatrixAt(vCount, this.dummyObj.matrix);
      this.tmpColor.setHex(v.color);
      this.vfxInstanced.setColorAt(vCount, this.tmpColor);
      vCount += 1;
    });
    this.commitInstances(this.vfxInstanced, vCount);

    // Sync Dynamic Glowing Beams (Thunder Arc Lightning + Rail Sniper Lasers + Dash Trails)
    let boltUsed = 0;
    let laserUsed = 0;
    if (beams) {
      beams.forEachActive((b) => {
        if (b.kind === 'lightning') {
          if (boltUsed >= this.lightningPool.length) return;
          this.updateLightningRibbon(this.lightningPool[boltUsed], b, simTimeSec);
          boltUsed += 1;
        } else {
          if (laserUsed >= this.laserPool.length) return;
          const slot = this.laserPool[laserUsed];
          const dx = b.x1 - b.x0;
          const dy = b.y1 - b.y0;
          const dz = b.z1 - b.z0;
          const len = Math.hypot(dx, dy, dz) || 0.1;
          const ratio = Math.max(0, Math.min(1, b.lifeSec / Math.max(0.01, b.maxLifeSec)));
          const thickness = b.width * (0.35 + 0.85 * ratio);

          slot.group.position.set((b.x0 + b.x1) * 0.5, (b.y0 + b.y1) * 0.5, (b.z0 + b.z1) * 0.5);
          slot.group.rotation.set(0, Math.atan2(dx, dz), 0);
          slot.group.scale.set(thickness, thickness, len);
          slot.haloMat.color.setHex(b.color);
          slot.haloMat.opacity = ratio * 0.88;
          slot.coreMat.opacity = Math.min(1, ratio * 1.35);
          slot.group.visible = true;
          laserUsed += 1;
        }
      });
    }
    for (let i = boltUsed; i < this.lightningPool.length; i += 1) {
      this.lightningPool[i].mesh.visible = false;
    }
    for (let i = laserUsed; i < this.laserPool.length; i += 1) {
      this.laserPool[i].group.visible = false;
    }

    // Sync Custom GLSL Ground Shockwaves + Celestial Starfall Pillars
    let swUsed = 0;
    let pillarUsed = 0;
    if (shockwaves) {
      shockwaves.forEachActive((sw) => {
        if (swUsed >= this.shockwavePool.length) return;
        const slot = this.shockwavePool[swUsed];
        const progress = 1 - Math.max(0, Math.min(1, sw.lifeSec / Math.max(0.01, sw.maxLifeSec)));
        slot.mesh.position.set(sw.x, 0.14 + swUsed * 0.004, sw.z);
        slot.mesh.scale.setScalar(sw.maxRadius);
        slot.mat.uniforms.uProgress.value = Math.max(0.04, progress);
        slot.mat.uniforms.uTime.value = simTimeSec;
        slot.mat.uniforms.uColor.value.setHex(sw.color);
        slot.mat.uniforms.uStyle.value = sw.style;
        slot.mesh.visible = true;
        swUsed += 1;

        if (sw.hasPillar && pillarUsed < this.starfallPillars.length) {
          const pSlot = this.starfallPillars[pillarUsed];
          const fade = Math.pow(1 - progress, 1.35);
          pSlot.mesh.position.set(sw.x, 7.5, sw.z);
          pSlot.mesh.scale.set(0.6 + progress * 1.4, 1, 0.6 + progress * 1.4);
          pSlot.mat.uniforms.uTime.value = simTimeSec;
          pSlot.mat.uniforms.uColor.value.setHex(sw.color);
          pSlot.mat.uniforms.uOpacity.value = fade * 0.95;
          pSlot.mesh.visible = fade > 0.02;
          pillarUsed += 1;
        }
      });
    }
    for (let i = swUsed; i < this.shockwavePool.length; i += 1) {
      this.shockwavePool[i].mesh.visible = false;
    }
    for (let i = pillarUsed; i < this.starfallPillars.length; i += 1) {
      this.starfallPillars[i].mesh.visible = false;
    }

    if (supply.active) {
      this.supplyGroup.visible = true;
      this.supplyGroup.position.set(supply.x, 0, supply.z);
      this.supplyGroup.rotation.y = simTimeSec * 0.65;
      const pulse = 1 + Math.sin(simTimeSec * 6) * 0.14;
      this.supplyRing.scale.setScalar(pulse);
      this.supplyPillarMat.uniforms.uTime.value = simTimeSec;
    } else {
      this.supplyGroup.visible = false;
    }

    for (let i = 0; i < 2; i += 1) {
      const gate = bridgeGates[i];
      const grp = this.gateGroups[i];
      if (gate.active) {
        grp.visible = true;
        grp.position.set(gate.x, 0, gate.z);
        const ratio = Math.max(0, Math.min(1, gate.hp / Math.max(1, gate.maxHp)));
        const pulse = 0.85 + 0.15 * Math.sin(simTimeSec * 8 + i * 1.4);
        this.gateMaterials[i].opacity = (0.34 + 0.44 * ratio) * pulse;
        this.gateBeamMaterials[i].opacity = (0.48 + 0.5 * ratio) * pulse;
        this.gateTextures[i].offset.y = -(simTimeSec * 0.65) % 1;

        const pct = Math.max(0, Math.min(100, Math.ceil(ratio * 100)));
        const isCharge = gate.gateMode === 'charge';
        const isCorrupted = isCharge && gate.corrupted;
        const beamHex = isCorrupted
          ? 0xef4444
          : isCharge
            ? gate.chargeTier >= 3
              ? 0xfde047
              : gate.chargeTier === 2
                ? 0xc026d3
                : 0xf59e0b
            : 0x0ea5e9;
        this.gateMaterials[i].color.setHex(beamHex);
        this.gateBeamMaterials[i].color.setHex(beamHex);

        const displayPct = isCharge ? 100 - pct : pct;
        const gateText = lang === 'en' && gate.labelEn ? gate.labelEn : gate.label;
        const titleTxt = isCorrupted
          ? lang === 'en'
            ? `⚠ Purify: ${gateText}`
            : `⚠ 污染 · ${gateText}`
          : isCharge && gate.chargeTier > 1
            ? `${gateText} ×${gate.chargeTier}`
            : gateText;
        const key = `${titleTxt}|${gate.gateMode}|${gate.corrupted ? 1 : 0}|${gate.chargeTier}|${displayPct}|${lang}`;
        const lbl = this.gateLabels[i];
        if (lbl.lastKey !== key) {
          lbl.lastKey = key;
          const ctx = lbl.ctx;
          const accent = isCorrupted
            ? '#ef4444'
            : isCharge
              ? gate.chargeTier >= 3
                ? '#fde047'
                : gate.chargeTier === 2
                  ? '#e879f9'
                  : '#fbbf24'
              : '#38bdf8';
          const barBg = 'rgba(15, 23, 42, 0.92)';
          ctx.clearRect(0, 0, 320, 120);

          ctx.fillStyle = isCorrupted ? 'rgba(45, 8, 16, 0.92)' : 'rgba(8, 15, 32, 0.9)';
          ctx.strokeStyle = accent;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.roundRect(8, 8, 304, 104, 18);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = accent;
          ctx.fillRect(22, 8, 42, 4);
          ctx.fillRect(256, 108, 42, 4);

          ctx.fillStyle = isCorrupted
            ? '#fca5a5'
            : isCharge
              ? gate.chargeTier >= 2
                ? '#f5d0fe'
                : '#fde047'
              : '#bae6fd';
          ctx.font = 'bold 26px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(titleTxt, 160, 50, 276);

          const bx = 34;
          const by = 68;
          const bw = 252;
          const bh = 24;
          ctx.fillStyle = barBg;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bh, 10);
          ctx.fill();
          ctx.stroke();

          const fillW = Math.max(10, Math.round(bw * (Math.max(4, displayPct) / 100)));
          ctx.fillStyle = isCorrupted
            ? '#ef4444'
            : isCharge
              ? gate.chargeTier >= 2
                ? '#c026d3'
                : '#f59e0b'
              : '#0ea5e9';
          ctx.beginPath();
          ctx.roundRect(bx + 2, by + 2, Math.max(8, fillW - 4), bh - 4, 8);
          ctx.fill();

          const barTxt = isCorrupted
            ? lang === 'en'
              ? `Purify -> x2 (${displayPct}%)`
              : `射击净化升阶 ${displayPct}%`
            : isCharge
              ? lang === 'en'
                ? `Lv.${gate.chargeTier} Charge ${displayPct}%`
                : `Lv.${gate.chargeTier} 充能 ${displayPct}%`
              : lang === 'en'
                ? `Barrier ${pct}%`
                : `光栅护盾 ${pct}%`;
          ctx.font = 'bold 16px system-ui, sans-serif';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(8, 15, 32, 0.95)';
          ctx.strokeText(barTxt, 160, 86);
          ctx.fillStyle = '#f8fafc';
          ctx.fillText(barTxt, 160, 86);

          lbl.tex.needsUpdate = true;
        }
      } else {
        grp.visible = false;
      }
    }
  }

  public hideAll(): void {
    this.slimeInstanced.count = 0;
    this.boarInstanced.count = 0;
    this.mageInstanced.count = 0;
    this.eliteInstanced.count = 0;
    this.shieldInstanced.count = 0;
    this.telegraphInstanced.count = 0;
    this.playerProjInstanced.count = 0;
    this.playerProjGlowInstanced.count = 0;
    this.enemyProjInstanced.count = 0;
    this.enemyProjGlowInstanced.count = 0;
    this.dropInstanced.count = 0;
    this.dropGlowInstanced.count = 0;
    this.vfxInstanced.count = 0;
    this.bossGroup.visible = false;
    this.bossSlamRing.visible = false;
    this.bossSlamFill.visible = false;
    this.supplyGroup.visible = false;
    this.gateGroups[0].visible = false;
    this.gateGroups[1].visible = false;
    for (let i = 0; i < this.lightningPool.length; i += 1) {
      this.lightningPool[i].mesh.visible = false;
    }
    for (let i = 0; i < this.laserPool.length; i += 1) {
      this.laserPool[i].group.visible = false;
    }
    for (let i = 0; i < this.shockwavePool.length; i += 1) {
      this.shockwavePool[i].mesh.visible = false;
    }
    for (let i = 0; i < this.starfallPillars.length; i += 1) {
      this.starfallPillars[i].mesh.visible = false;
    }
  }

  public dispose(): void {
    for (const obj of this.managedObjects) {
      this.scene.remove(obj);
    }
    this.managedObjects.length = 0;
    this.scene.remove(this.bossGroup);
    this.scene.remove(this.bossSlamRing);
    this.scene.remove(this.bossSlamFill);
    this.scene.remove(this.supplyGroup);
    this.scene.remove(this.gateGroups[0]);
    this.scene.remove(this.gateGroups[1]);
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
  }
}
