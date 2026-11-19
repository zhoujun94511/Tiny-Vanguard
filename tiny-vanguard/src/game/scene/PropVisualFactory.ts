import * as THREE from 'three';
import type { BridgeConfig, ObstacleConfig } from '../content/definitions/ContentTypes';
import { getCachedTerrainSurfaceTexture } from './ProceduralTextures';
import { createBeaconPillarMaterial, getVfxGlowTexture } from './VfxShaderFactory';

/**
 * Creates a detailed obstacle prop: a Sculpted Ancient Runic Obelisk / Basalt Magma Pylon
 * with stepped plinth, corner buttresses, glowing runic band, and a levitating apex crystal.
 */
export function createObstacleProp(obs: ObstacleConfig): THREE.Group {
  const group = new THREE.Group();
  group.position.set(obs.x, 0, obs.z);

  const r = (obs.color >> 16) & 0xff;
  const b = obs.color & 0xff;
  const isVoidStone = b > r * 1.15 && r < 0x50;
  const isDarkStone = !isVoidStone && r < 0x55;
  const runeHex = isVoidStone ? 0xc084fc : isDarkStone ? 0xf97316 : 0x38bdf8;
  const runeEmissive = isVoidStone ? 0x9333ea : isDarkStone ? 0xea580c : 0x0284c7;

  const stoneMat = new THREE.MeshStandardMaterial({
    color: isVoidStone ? 0x2e1f47 : isDarkStone ? 0x292524 : 0x475569,
    roughness: 0.78,
    metalness: 0.22,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: isVoidStone ? 0x4c1d95 : isDarkStone ? 0x44403c : 0x64748b,
    roughness: 0.52,
    metalness: 0.45,
  });
  const runeMat = new THREE.MeshStandardMaterial({
    color: runeHex,
    emissive: runeEmissive,
    emissiveIntensity: 1.45,
    roughness: 0.2,
  });

  // Stepped 2-tier octagonal foundation plinth
  const baseBot = new THREE.Mesh(
    new THREE.CylinderGeometry(obs.radius * 1.15, obs.radius * 1.32, 0.26, 8),
    stoneMat
  );
  baseBot.position.y = 0.13;
  baseBot.castShadow = true;
  baseBot.receiveShadow = true;
  group.add(baseBot);

  const baseTop = new THREE.Mesh(
    new THREE.CylinderGeometry(obs.radius * 0.92, obs.radius * 1.08, 0.24, 8),
    trimMat
  );
  baseTop.position.y = 0.38;
  baseTop.castShadow = true;
  baseTop.receiveShadow = true;
  group.add(baseTop);

  // Tapered sculpted obelisk shaft
  const shaftH = Math.max(1.2, obs.height - 0.55);
  const col = new THREE.Mesh(
    new THREE.CylinderGeometry(obs.radius * 0.56, obs.radius * 0.8, shaftH, 6),
    stoneMat
  );
  col.position.y = 0.5 + shaftH * 0.5;
  col.castShadow = true;
  col.receiveShadow = true;
  group.add(col);

  // 4 Vertical Corner Buttress Ribs
  const ribGeo = new THREE.BoxGeometry(obs.radius * 0.2, shaftH * 0.92, obs.radius * 0.26);
  for (let i = 0; i < 4; i += 1) {
    const ang = (i * Math.PI) / 2 + Math.PI / 4;
    const rib = new THREE.Mesh(ribGeo, trimMat);
    rib.position.set(
      Math.cos(ang) * obs.radius * 0.68,
      0.5 + shaftH * 0.44,
      Math.sin(ang) * obs.radius * 0.68
    );
    rib.rotation.y = -ang;
    rib.castShadow = true;
    group.add(rib);
  }

  // Glowing Recessed Runic Collar Ring
  const runeBand = new THREE.Mesh(
    new THREE.CylinderGeometry(obs.radius * 0.68, obs.radius * 0.72, 0.14, 6),
    runeMat
  );
  runeBand.position.y = 0.5 + shaftH * 0.62;
  group.add(runeBand);

  // Crown capital platform
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(obs.radius * 0.78, obs.radius * 0.6, 0.28, 6),
    trimMat
  );
  cap.position.y = obs.height + 0.04;
  cap.castShadow = true;
  group.add(cap);

  // Hovering Runic Apex Crystal + Additive Halo
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(obs.radius * 0.34, 0),
    runeMat
  );
  crystal.position.y = obs.height + 0.62;
  crystal.scale.set(0.82, 1.55, 0.82);
  crystal.rotation.set(0.18, 0.6, 0.12);
  group.add(crystal);

  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(obs.radius * 1.45, obs.radius * 1.45),
    new THREE.MeshBasicMaterial({
      map: getVfxGlowTexture(),
      color: runeHex,
      transparent: true,
      opacity: 0.68,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  halo.position.y = obs.height + 0.62;
  halo.rotation.x = -Math.PI / 2;
  group.add(halo);

  // Flanking base shards (ember spikes or glowing blue runestones)
  const shardGeo = new THREE.OctahedronGeometry(obs.radius * 0.22, 0);
  for (let i = 0; i < 4; i += 1) {
    const ang = (i * Math.PI) / 2 + 0.35;
    const c = new THREE.Mesh(shardGeo, runeMat);
    c.position.set(
      Math.cos(ang) * obs.radius * 0.96,
      0.42 + (i % 2) * 0.1,
      Math.sin(ang) * obs.radius * 0.96
    );
    c.scale.set(0.65, 1.6, 0.65);
    c.rotation.set(Math.sin(ang) * 0.4, ang, -Math.cos(ang) * 0.4);
    group.add(c);
  }

  return group;
}

/**
 * Creates perimeter environmental framing: either a lush multi-tier pine/oak cluster
 * (meadow) or a jagged volcanic basalt spire with glowing magma shards (ember canyon).
 */
export function createPerimeterTreeProp(
  x: number,
  z: number,
  scale = 1,
  isDarkTheme = false
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);

  if (isDarkTheme) {
    const spireMat = new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 0.88, metalness: 0.1 });
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      emissive: 0xea580c,
      emissiveIntensity: 1.2,
      roughness: 0.28,
    });

    const mainSpire = new THREE.Mesh(new THREE.ConeGeometry(1.15, 3.6, 6), spireMat);
    mainSpire.position.y = 1.75;
    mainSpire.rotation.y = (x + z) * 0.3;
    mainSpire.castShadow = true;
    group.add(mainSpire);

    const sideSpire = new THREE.Mesh(new THREE.ConeGeometry(0.75, 2.3, 6), spireMat);
    sideSpire.position.set(0.65, 1.05, 0.3);
    sideSpire.rotation.z = -0.25;
    group.add(sideSpire);

    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), crystalMat);
    shard.position.set(-0.5, 1.1, 0.45);
    shard.scale.set(0.65, 1.65, 0.65);
    shard.rotation.z = 0.35;
    group.add(shard);
    return group;
  }

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.38, 1.45, 7), trunkMat);
  trunk.position.y = 0.72;
  trunk.castShadow = true;
  group.add(trunk);

  const leafMatA = new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.78 });
  const leafMatB = new THREE.MeshStandardMaterial({ color: 0x40916c, roughness: 0.74 });
  const leafMatC = new THREE.MeshStandardMaterial({ color: 0x52b788, roughness: 0.72 });

  const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.42, 1.8, 8), leafMatA);
  c1.position.y = 1.95;
  c1.castShadow = true;
  group.add(c1);

  const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.12, 1.55, 8), leafMatB);
  c2.position.y = 2.85;
  c2.castShadow = true;
  group.add(c2);

  const c3 = new THREE.Mesh(new THREE.ConeGeometry(0.76, 1.15, 8), leafMatC);
  c3.position.y = 3.65;
  c3.castShadow = true;
  group.add(c3);

  return group;
}

/**
 * Creates a stylized textured survival arena: layered terrain textures, stone-curbed cross-paths,
 * a 3-tier sculpted central medallion plaza, perimeter ring curb, and instanced environment details.
 */
export function createSunnyMeadowGroup(
  arenaRadius: number,
  innerColor: number,
  outerColor: number,
  pathColor = 0xe9d6a8
): THREE.Group {
  const group = new THREE.Group();
  const rCh = (innerColor >> 16) & 0xff;
  const gCh = (innerColor >> 8) & 0xff;
  const isDarkTheme = rCh >= gCh;

  // Outer textured expanse
  const outerTex = getCachedTerrainSurfaceTexture(
    isDarkTheme ? 'ember' : 'meadow',
    outerColor,
    isDarkTheme ? 0xf97316 : innerColor,
    18,
    18
  );
  const outerGeo = new THREE.CircleGeometry(arenaRadius + 30, 64);
  outerGeo.rotateX(-Math.PI / 2);
  const outerMat = new THREE.MeshStandardMaterial({ map: outerTex, roughness: 0.94 });
  const outer = new THREE.Mesh(outerGeo, outerMat);
  outer.receiveShadow = true;
  group.add(outer);

  // Inner playable arena circle with procedural painterly/volcanic texture
  const innerTex = getCachedTerrainSurfaceTexture(
    isDarkTheme ? 'ember' : 'meadow',
    innerColor,
    isDarkTheme ? pathColor : outerColor,
    10,
    10
  );
  const innerGeo = new THREE.CircleGeometry(arenaRadius + 0.4, 64);
  innerGeo.rotateX(-Math.PI / 2);
  const innerMat = new THREE.MeshStandardMaterial({ map: innerTex, roughness: 0.88 });
  const inner = new THREE.Mesh(innerGeo, innerMat);
  inner.position.y = 0.006;
  inner.receiveShadow = true;
  group.add(inner);

  // Textured cross-paths + flanking stone curbs (eliminates flat "+ sticker" demo look)
  const pathTex = getCachedTerrainSurfaceTexture(
    isDarkTheme ? 'magma-path' : 'sand-path',
    pathColor,
    isDarkTheme ? 0x292524 : 0x52525b,
    2,
    12
  );
  const pathMat = new THREE.MeshStandardMaterial({
    map: pathTex,
    emissive: isDarkTheme ? pathColor : 0x000000,
    emissiveIntensity: isDarkTheme ? 0.22 : 0,
    roughness: isDarkTheme ? 0.65 : 0.86,
  });
  const curbMat = new THREE.MeshStandardMaterial({
    color: isDarkTheme ? 0x292524 : 0x64748b,
    roughness: 0.78,
    metalness: 0.18,
  });

  for (const rot of [0, Math.PI / 2]) {
    const pathGeo = new THREE.PlaneGeometry(3.5, arenaRadius * 1.96);
    pathGeo.rotateX(-Math.PI / 2);
    const pathMesh = new THREE.Mesh(pathGeo, pathMat);
    pathMesh.rotation.y = rot;
    pathMesh.position.y = 0.014;
    pathMesh.receiveShadow = true;
    group.add(pathMesh);

    // Sculpted flanking curb strips along each road edge
    for (const side of [-1, 1]) {
      const curbGeo = new THREE.BoxGeometry(0.24, 0.07, arenaRadius * 1.92);
      const curb = new THREE.Mesh(curbGeo, curbMat);
      curb.position.set(
        rot === 0 ? side * 1.85 : 0,
        0.035,
        rot === 0 ? 0 : side * 1.85
      );
      curb.rotation.y = rot;
      curb.receiveShadow = true;
      group.add(curb);
    }
  }

  // Sculpted 3-Tier Central Coliseum / Caldera Medallion Plaza
  const plazaBaseGeo = new THREE.CylinderGeometry(4.5, 4.75, 0.06, 32);
  const plazaBase = new THREE.Mesh(plazaBaseGeo, curbMat);
  plazaBase.position.y = 0.03;
  plazaBase.receiveShadow = true;
  group.add(plazaBase);

  const plazaTex = getCachedTerrainSurfaceTexture(
    isDarkTheme ? 'magma-path' : 'sand-path',
    isDarkTheme ? 0x3f2e26 : 0x857d6e,
    isDarkTheme ? 0xf97316 : 0x475569,
    2,
    2
  );
  const plazaMat = new THREE.MeshStandardMaterial({ map: plazaTex, roughness: 0.8, metalness: 0.1 });
  const plazaTopGeo = new THREE.CylinderGeometry(4.1, 4.1, 0.04, 32);
  const plazaTop = new THREE.Mesh(plazaTopGeo, plazaMat);
  plazaTop.position.y = 0.062;
  plazaTop.receiveShadow = true;
  group.add(plazaTop);

  const runeRingGeo = new THREE.RingGeometry(2.65, 2.95, 32);
  runeRingGeo.rotateX(-Math.PI / 2);
  const runeRingMat = new THREE.MeshBasicMaterial({
    color: isDarkTheme ? 0xfb923c : 0xfef08a,
    transparent: true,
    opacity: isDarkTheme ? 0.72 : 0.58,
  });
  const runeRing = new THREE.Mesh(runeRingGeo, runeRingMat);
  runeRing.position.y = 0.085;
  group.add(runeRing);

  // Sculpted Outer Coliseum Boundary Rim
  const borderGeo = new THREE.RingGeometry(arenaRadius - 0.18, arenaRadius + 0.42, 64);
  borderGeo.rotateX(-Math.PI / 2);
  const borderMat = new THREE.MeshBasicMaterial({
    color: isDarkTheme ? 0xf97316 : 0xfef08a,
    transparent: true,
    opacity: 0.78,
  });
  const border = new THREE.Mesh(borderGeo, borderMat);
  border.position.y = 0.03;
  group.add(border);

  // Instanced Perimeter Framing Ring (40 Volcanic Spires -> 3 draw calls OR 40 Lush Pines -> 4 draw calls)
  const treeCount = 40;
  const ringDummy = new THREE.Object3D();
  if (isDarkTheme) {
    const spireMat = new THREE.MeshStandardMaterial({ color: 0x292524, roughness: 0.88, metalness: 0.1 });
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      emissive: 0xea580c,
      emissiveIntensity: 1.2,
      roughness: 0.28,
    });
    const mainInst = new THREE.InstancedMesh(new THREE.ConeGeometry(1.15, 3.6, 6), spireMat, treeCount);
    const sideInst = new THREE.InstancedMesh(new THREE.ConeGeometry(0.75, 2.3, 6), spireMat, treeCount);
    const shardInst = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.45, 0), crystalMat, treeCount);
    for (let i = 0; i < treeCount; i += 1) {
      const ang = (i / treeCount) * Math.PI * 2 + (i % 3) * 0.04;
      const r = arenaRadius + 2.2 + (i % 4) * 1.4;
      const sc = 0.85 + (i % 3) * 0.25;
      const tx = Math.cos(ang) * r;
      const tz = Math.sin(ang) * r;

      ringDummy.position.set(tx, 1.75 * sc, tz);
      ringDummy.rotation.set(0, (tx + tz) * 0.3, 0);
      ringDummy.scale.setScalar(sc);
      ringDummy.updateMatrix();
      mainInst.setMatrixAt(i, ringDummy.matrix);

      ringDummy.position.set(tx + 0.65 * sc, 1.05 * sc, tz + 0.3 * sc);
      ringDummy.rotation.set(0, 0, -0.25);
      ringDummy.scale.setScalar(sc);
      ringDummy.updateMatrix();
      sideInst.setMatrixAt(i, ringDummy.matrix);

      ringDummy.position.set(tx - 0.5 * sc, 1.1 * sc, tz + 0.45 * sc);
      ringDummy.rotation.set(0, 0, 0.35);
      ringDummy.scale.set(0.65 * sc, 1.65 * sc, 0.65 * sc);
      ringDummy.updateMatrix();
      shardInst.setMatrixAt(i, ringDummy.matrix);
    }
    mainInst.instanceMatrix.needsUpdate = true;
    sideInst.instanceMatrix.needsUpdate = true;
    shardInst.instanceMatrix.needsUpdate = true;
    group.add(mainInst, sideInst, shardInst);
  } else {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
    const leafMatA = new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.78 });
    const leafMatB = new THREE.MeshStandardMaterial({ color: 0x40916c, roughness: 0.74 });
    const leafMatC = new THREE.MeshStandardMaterial({ color: 0x52b788, roughness: 0.72 });

    const trunkInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.24, 0.38, 1.45, 7), trunkMat, treeCount);
    const c1Inst = new THREE.InstancedMesh(new THREE.ConeGeometry(1.42, 1.8, 8), leafMatA, treeCount);
    const c2Inst = new THREE.InstancedMesh(new THREE.ConeGeometry(1.12, 1.55, 8), leafMatB, treeCount);
    const c3Inst = new THREE.InstancedMesh(new THREE.ConeGeometry(0.76, 1.15, 8), leafMatC, treeCount);

    for (let i = 0; i < treeCount; i += 1) {
      const ang = (i / treeCount) * Math.PI * 2 + (i % 3) * 0.04;
      const r = arenaRadius + 2.2 + (i % 4) * 1.4;
      const sc = 0.85 + (i % 3) * 0.25;
      const tx = Math.cos(ang) * r;
      const tz = Math.sin(ang) * r;

      ringDummy.rotation.set(0, 0, 0);
      ringDummy.scale.setScalar(sc);

      ringDummy.position.set(tx, 0.72 * sc, tz);
      ringDummy.updateMatrix();
      trunkInst.setMatrixAt(i, ringDummy.matrix);

      ringDummy.position.set(tx, 1.95 * sc, tz);
      ringDummy.updateMatrix();
      c1Inst.setMatrixAt(i, ringDummy.matrix);

      ringDummy.position.set(tx, 2.85 * sc, tz);
      ringDummy.updateMatrix();
      c2Inst.setMatrixAt(i, ringDummy.matrix);

      ringDummy.position.set(tx, 3.65 * sc, tz);
      ringDummy.updateMatrix();
      c3Inst.setMatrixAt(i, ringDummy.matrix);
    }
    trunkInst.instanceMatrix.needsUpdate = true;
    c1Inst.instanceMatrix.needsUpdate = true;
    c2Inst.instanceMatrix.needsUpdate = true;
    c3Inst.instanceMatrix.needsUpdate = true;
    group.add(trunkInst, c1Inst, c2Inst, c3Inst);
  }

  // Instanced ground scatter (ember crystals + basalt pebbles OR wildflower tufts + pebbles, 1 draw call)
  const scatterCount = 150;
  const scatterGeo = isDarkTheme
    ? new THREE.OctahedronGeometry(0.18, 0)
    : new THREE.DodecahedronGeometry(0.15, 0);
  if (!isDarkTheme) {
    scatterGeo.scale(1.25, 0.55, 1.25);
  }
  const scatterMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.75,
    metalness: 0.15,
  });
  const scatter = new THREE.InstancedMesh(scatterGeo, scatterMat, scatterCount);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const palette = isDarkTheme
    ? [0xf97316, 0xfb923c, 0x57534e, 0xfbbf24]
    : [0xfef08a, 0xfda4af, 0xf8fafc, 0xc4b5fd];

  let placed = 0;
  for (let i = 0; placed < scatterCount && i < scatterCount * 3; i += 1) {
    const ang = i * 2.39996;
    const r = 5.2 + Math.sqrt(((i % scatterCount) + 1) / scatterCount) * (arenaRadius + 2.5);
    const fx = Math.cos(ang) * r;
    const fz = Math.sin(ang) * r;
    // Keep cross-paths clear
    if (Math.abs(fx) < 2.25 || Math.abs(fz) < 2.25) continue;
    dummy.position.set(fx, isDarkTheme ? 0.1 : 0.06, fz);
    dummy.rotation.set(isDarkTheme ? 0.2 : 0, ang, isDarkTheme ? 0.15 : 0);
    dummy.scale.set(
      0.85 + (i % 3) * 0.25,
      isDarkTheme ? 1.15 + (i % 4) * 0.25 : 0.8 + (i % 3) * 0.2,
      0.85 + (i % 3) * 0.25
    );
    dummy.updateMatrix();
    scatter.setMatrixAt(placed, dummy.matrix);
    col.setHex(palette[placed % palette.length]);
    scatter.setColorAt(placed, col);
    placed += 1;
  }
  scatter.count = placed;
  scatter.instanceMatrix.needsUpdate = true;
  if (scatter.instanceColor) scatter.instanceColor.needsUpdate = true;
  group.add(scatter);

  return group;
}

/**
 * Creates a Sci-Fi Armored Supply Drop Pod with glowing core vents,
 * a tall vertical holographic beacon pillar, and a rotating ground radar ring.
 */
export function createSupplyCrateProp(): {
  group: THREE.Group;
  ring: THREE.Mesh;
  pillarMat: THREE.ShaderMaterial;
} {
  const group = new THREE.Group();
  group.visible = false;

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.35,
    metalness: 0.78,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: 0x78350f,
    emissiveIntensity: 0.35,
    roughness: 0.24,
    metalness: 0.84,
  });
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0x5eead4,
  });

  // Beveled octagonal armored drop pod body
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.72, 0.85, 8), hullMat);
  body.position.y = 0.44;
  body.castShadow = true;
  group.add(body);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.58, 0.28, 8), trimMat);
  cap.position.y = 1.0;
  cap.castShadow = true;
  group.add(cap);

  // Glowing cyan energy core band + 4 armor ribs
  const coreBand = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.68, 0.16, 8), coreMat);
  coreBand.position.y = 0.52;
  group.add(coreBand);

  const ribGeo = new THREE.BoxGeometry(0.14, 0.92, 0.18);
  for (let i = 0; i < 4; i += 1) {
    const ang = (i * Math.PI) / 2;
    const rib = new THREE.Mesh(ribGeo, trimMat);
    rib.position.set(Math.cos(ang) * 0.62, 0.48, Math.sin(ang) * 0.62);
    rib.rotation.y = -ang;
    group.add(rib);
  }

  // Tall holographic sky-beacon pillar (instantly readable across arena)
  const pillarGeo = new THREE.CylinderGeometry(0.28, 0.85, 11.5, 14, 1, true);
  const pillarMat = createBeaconPillarMaterial(0x5eead4, 0.72);
  const pillar = new THREE.Mesh(pillarGeo, pillarMat);
  pillar.position.y = 5.8;
  group.add(pillar);

  const ringGeo = new THREE.RingGeometry(1.15, 1.4, 36);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x5eead4,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.06;
  group.add(ring);

  return { group, ring, pillarMat };
}

/**
 * Creates a detailed stylized bridge over animated/textured rushing water with support piers,
 * wood/frost plank textures, glowing lanterns, multi-rock scenic islets, and a chevron defense line.
 */
export function createBridgeArenaGroup(cfg: BridgeConfig): THREE.Group {
  const group = new THREE.Group();
  const length = cfg.maxZ - cfg.minZ;
  const centerZ = (cfg.minZ + cfg.maxZ) * 0.5;
  const width = cfg.halfWidth * 2;
  const isFrostTheme = (cfg.lanternColor ?? 0) === 0x38bdf8;

  // Textured rushing river water plane
  const waterTex = getCachedTerrainSurfaceTexture(
    'water',
    cfg.waterColor,
    isFrostTheme ? 0x38bdf8 : 0x7dd3fc,
    18,
    18
  );
  const waterGeo = new THREE.PlaneGeometry(160, 160);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshStandardMaterial({
    map: waterTex,
    roughness: 0.2,
    metalness: 0.14,
  });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.set(0, -1.45, centerZ);
  water.receiveShadow = true;
  group.add(water);

  // White water foam wake ribbons along both bridge foundations
  const foamMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.32,
  });
  const foamGeo = new THREE.PlaneGeometry(0.55, length + 2);
  foamGeo.rotateX(-Math.PI / 2);
  for (const side of [-1, 1]) {
    const foam = new THREE.Mesh(foamGeo, foamMat);
    foam.position.set(side * (cfg.halfWidth + 0.42), -1.42, centerZ);
    group.add(foam);
  }

  // Instanced support piers descending into river beneath bridge deck (1 draw call)
  const beamMat = new THREE.MeshStandardMaterial({ color: cfg.railColor, roughness: 0.78 });
  const pierGeo = new THREE.CylinderGeometry(0.42, 0.55, 2.2, 8);
  const instDummy = new THREE.Object3D();
  const pierCoords: Array<[number, number]> = [];
  for (let z = cfg.minZ + 3; z <= cfg.maxZ - 2; z += 9.5) {
    pierCoords.push([-(cfg.halfWidth - 0.55), z], [cfg.halfWidth - 0.55, z]);
  }
  const pierInst = new THREE.InstancedMesh(pierGeo, beamMat, Math.max(1, pierCoords.length));
  for (let i = 0; i < pierCoords.length; i += 1) {
    instDummy.position.set(pierCoords[i][0], -1.2, pierCoords[i][1]);
    instDummy.rotation.set(0, 0, 0);
    instDummy.scale.setScalar(1);
    instDummy.updateMatrix();
    pierInst.setMatrixAt(i, instDummy.matrix);
  }
  pierInst.count = pierCoords.length;
  pierInst.instanceMatrix.needsUpdate = true;
  group.add(pierInst);

  // Longitudinal underside support beams + continuous sub-deck timber slab (zero water bleed between planks)
  const beamGeo = new THREE.BoxGeometry(0.48, 0.65, length);
  for (const bx of [-cfg.halfWidth + 0.6, 0, cfg.halfWidth - 0.6]) {
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(bx, -0.45, centerZ);
    group.add(beam);
  }
  const subDeckGeo = new THREE.BoxGeometry(width + 0.14, 0.16, length);
  const subDeck = new THREE.Mesh(subDeckGeo, beamMat);
  subDeck.position.set(0, -0.2, centerZ);
  subDeck.receiveShadow = true;
  group.add(subDeck);

  // Instanced alternating deck planks (2 draw calls instead of ~24)
  const plankStyle = isFrostTheme ? 'frost-plank' : 'wood-plank';
  const plankTexA = getCachedTerrainSurfaceTexture(plankStyle, cfg.plankColor, cfg.railColor, 2, 1);
  const plankTexB = getCachedTerrainSurfaceTexture(
    plankStyle,
    cfg.plankAltColor ?? 0xcab08e,
    cfg.railColor,
    2,
    1
  );
  const plankGeo = new THREE.BoxGeometry(width + 0.2, 0.22, 1.58);
  const plankMatA = new THREE.MeshStandardMaterial({ map: plankTexA, roughness: 0.82 });
  const plankMatB = new THREE.MeshStandardMaterial({ map: plankTexB, roughness: 0.85 });

  const plankAZ: number[] = [];
  const plankBZ: number[] = [];
  let plankIdx = 0;
  for (let z = cfg.minZ + 0.8; z <= cfg.maxZ - 0.5; z += 1.65) {
    if (plankIdx % 2 === 0) plankAZ.push(z);
    else plankBZ.push(z);
    plankIdx += 1;
  }
  const plankInstA = new THREE.InstancedMesh(plankGeo, plankMatA, Math.max(1, plankAZ.length));
  const plankInstB = new THREE.InstancedMesh(plankGeo, plankMatB, Math.max(1, plankBZ.length));
  plankInstA.receiveShadow = true;
  plankInstB.receiveShadow = true;
  instDummy.rotation.set(0, 0, 0);
  instDummy.scale.setScalar(1);
  for (let i = 0; i < plankAZ.length; i += 1) {
    instDummy.position.set(0, -0.11, plankAZ[i]);
    instDummy.updateMatrix();
    plankInstA.setMatrixAt(i, instDummy.matrix);
  }
  for (let i = 0; i < plankBZ.length; i += 1) {
    instDummy.position.set(0, -0.11, plankBZ[i]);
    instDummy.updateMatrix();
    plankInstB.setMatrixAt(i, instDummy.matrix);
  }
  plankInstA.count = plankAZ.length;
  plankInstB.count = plankBZ.length;
  plankInstA.instanceMatrix.needsUpdate = true;
  plankInstB.instanceMatrix.needsUpdate = true;
  group.add(plankInstA, plankInstB);

  // Side deck edge curbs
  const edgeTrimGeo = new THREE.BoxGeometry(0.28, 0.14, length);
  for (const side of [-1, 1]) {
    const trim = new THREE.Mesh(edgeTrimGeo, beamMat);
    trim.position.set(side * (cfg.halfWidth + 0.04), 0.04, centerZ);
    group.add(trim);
  }

  // Side railings + Instanced posts, post caps & glowing lantern beacons (3 draw calls instead of ~48)
  const railGeo = new THREE.BoxGeometry(0.28, 0.22, length);
  const postGeo = new THREE.BoxGeometry(0.42, 1.2, 0.42);
  const postCapGeo = new THREE.BoxGeometry(0.52, 0.12, 0.52);
  const lanternHex = cfg.lanternColor ?? 0xffb703;
  const lanternMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: lanternHex,
    emissiveIntensity: 1.5,
    roughness: 0.2,
  });
  const lanternGeo = new THREE.OctahedronGeometry(0.2, 0);

  const postCoords: Array<[number, number]> = [];
  const lanternCoords: Array<[number, number]> = [];
  for (const side of [-1, 1]) {
    const rx = side * (cfg.halfWidth + 0.18);
    const rail = new THREE.Mesh(railGeo, beamMat);
    rail.position.set(rx, 0.78, centerZ);
    rail.castShadow = true;
    group.add(rail);

    const lowerRail = new THREE.Mesh(railGeo, beamMat);
    lowerRail.position.set(rx, 0.35, centerZ);
    group.add(lowerRail);

    let pIdx = 0;
    for (let z = cfg.minZ + 1; z <= cfg.maxZ - 1; z += 4.95) {
      postCoords.push([rx, z]);
      if (pIdx % 2 === 0) {
        lanternCoords.push([rx, z]);
      }
      pIdx += 1;
    }
  }
  const postInst = new THREE.InstancedMesh(postGeo, beamMat, Math.max(1, postCoords.length));
  const postCapInst = new THREE.InstancedMesh(postCapGeo, beamMat, Math.max(1, postCoords.length));
  const lanternInst = new THREE.InstancedMesh(lanternGeo, lanternMat, Math.max(1, lanternCoords.length));
  postInst.castShadow = true;
  instDummy.rotation.set(0, 0, 0);
  instDummy.scale.setScalar(1);
  for (let i = 0; i < postCoords.length; i += 1) {
    const [rx, z] = postCoords[i];
    instDummy.position.set(rx, 0.52, z);
    instDummy.updateMatrix();
    postInst.setMatrixAt(i, instDummy.matrix);
    instDummy.position.set(rx, 1.14, z);
    instDummy.updateMatrix();
    postCapInst.setMatrixAt(i, instDummy.matrix);
  }
  for (let i = 0; i < lanternCoords.length; i += 1) {
    const [rx, z] = lanternCoords[i];
    instDummy.position.set(rx, 1.38, z);
    instDummy.updateMatrix();
    lanternInst.setMatrixAt(i, instDummy.matrix);
  }
  postInst.count = postCoords.length;
  postCapInst.count = postCoords.length;
  lanternInst.count = lanternCoords.length;
  postInst.instanceMatrix.needsUpdate = true;
  postCapInst.instanceMatrix.needsUpdate = true;
  lanternInst.instanceMatrix.needsUpdate = true;
  group.add(postInst, postCapInst, lanternInst);

  // Stylized Chevron Defense Barrier Line + Flanking Warning Bollards
  const lineTex = getCachedTerrainSurfaceTexture('hazard-line', 0xff3b5c, 0xfef08a, 8, 1);
  const lineGeo = new THREE.PlaneGeometry(width - 0.1, 0.58);
  lineGeo.rotateX(-Math.PI / 2);
  const lineMat = new THREE.MeshBasicMaterial({
    map: lineTex,
    transparent: true,
    opacity: 0.92,
  });
  const defLine = new THREE.Mesh(lineGeo, lineMat);
  defLine.position.set(0, 0.03, cfg.defenseLineZ);
  group.add(defLine);

  // Hero Tactical Defense Bay (4.8m depth so Dash & Orbit Shields fit cleanly inside visible cyan boundary)
  const bayDepth = 4.8;
  const bayGeo = new THREE.PlaneGeometry(width - 0.65, bayDepth);
  bayGeo.rotateX(-Math.PI / 2);
  const bayMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.09,
    depthWrite: false,
  });
  const bayMesh = new THREE.Mesh(bayGeo, bayMat);
  bayMesh.position.set(0, 0.02, cfg.defenseLineZ - bayDepth * 0.5);
  group.add(bayMesh);

  const frontLineGeo = new THREE.PlaneGeometry(width - 0.5, 0.12);
  frontLineGeo.rotateX(-Math.PI / 2);
  const frontLineMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const frontLine = new THREE.Mesh(frontLineGeo, frontLineMat);
  frontLine.position.set(0, 0.032, cfg.defenseLineZ - bayDepth);
  group.add(frontLine);

  const bollardMat = new THREE.MeshStandardMaterial({
    color: 0xff3b5c,
    emissive: 0xdc2626,
    emissiveIntensity: 0.85,
  });
  const bollardGeo = new THREE.CylinderGeometry(0.18, 0.24, 0.55, 8);
  for (const side of [-1, 1]) {
    const b = new THREE.Mesh(bollardGeo, bollardMat);
    b.position.set(side * (cfg.halfWidth - 0.1), 0.27, cfg.defenseLineZ);
    group.add(b);
  }

  // Instanced Multi-rock Scenic River Islets (2 draw calls instead of 15)
  const rockGeo = new THREE.DodecahedronGeometry(1.15, 0);
  const rockMat = new THREE.MeshStandardMaterial({
    color: isFrostTheme ? 0xcbd5e1 : 0x94a3b8,
    roughness: 0.86,
  });
  const accentTopGeo = isFrostTheme
    ? new THREE.OctahedronGeometry(0.75, 0)
    : new THREE.ConeGeometry(0.85, 1.6, 7);
  const accentTopMat = new THREE.MeshStandardMaterial({
    color: isFrostTheme ? 0x38bdf8 : 0x2d6a4f,
    emissive: isFrostTheme ? 0x0284c7 : 0x000000,
    emissiveIntensity: isFrostTheme ? 0.45 : 0,
    roughness: isFrostTheme ? 0.25 : 0.8,
  });

  const isletCoords = [
    [-11.8, -16, 1.3],
    [12.8, -9, 1.05],
    [-13.5, 4, 0.95],
    [11.2, -22, 1.45],
    [14.2, 9, 1.1],
  ];
  const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, isletCoords.length * 2);
  const topInst = new THREE.InstancedMesh(accentTopGeo, accentTopMat, isletCoords.length);
  for (let i = 0; i < isletCoords.length; i += 1) {
    const [rx, rz, sc] = isletCoords[i];
    instDummy.position.set(rx, -1.1, rz);
    instDummy.scale.set(sc * 1.15, sc * 0.72, sc);
    instDummy.rotation.set(rx * 0.2, rz * 0.2, 0.3);
    instDummy.updateMatrix();
    rockInst.setMatrixAt(i * 2, instDummy.matrix);

    instDummy.position.set(rx + sc * 0.8, -1.25, rz - sc * 0.5);
    instDummy.scale.setScalar(sc * 0.58);
    instDummy.rotation.set(0, 0, 0);
    instDummy.updateMatrix();
    rockInst.setMatrixAt(i * 2 + 1, instDummy.matrix);

    instDummy.position.set(rx, -0.35 + sc * 0.35, rz);
    instDummy.scale.setScalar(sc * 0.85);
    instDummy.rotation.set(0, 0, 0);
    instDummy.updateMatrix();
    topInst.setMatrixAt(i, instDummy.matrix);
  }
  rockInst.instanceMatrix.needsUpdate = true;
  topInst.instanceMatrix.needsUpdate = true;
  group.add(rockInst, topInst);

  return group;
}
