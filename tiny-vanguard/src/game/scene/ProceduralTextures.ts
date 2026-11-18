import * as THREE from 'three';

/**
 * Generates a soft radial contact shadow texture (zero external assets).
 */
export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(8, 15, 30, 0.58)');
  grad.addColorStop(0.55, 'rgba(8, 15, 30, 0.24)');
  grad.addColorStop(1, 'rgba(8, 15, 30, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Generates a lightweight procedural sky-to-ground PMREM environment map once at startup
 * so metallic armor, swords, crowns, and shields have realistic reflections.
 */
export function createProceduralEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  const skyGeo = new THREE.SphereGeometry(20, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vWorldPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      void main() {
        float h = normalize(vWorldPos).y * 0.5 + 0.5;
        vec3 ground = vec3(0.18, 0.28, 0.24);
        vec3 horizon = vec3(0.68, 0.85, 0.96);
        vec3 zenith = vec3(0.28, 0.56, 0.88);
        vec3 col = h < 0.5
          ? mix(ground, horizon, smoothstep(0.2, 0.5, h))
          : mix(horizon, zenith, smoothstep(0.5, 0.95, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  envScene.add(skyDome);

  // Warm sun bounce panel
  const sunGeo = new THREE.CircleGeometry(4, 16);
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff3d1 });
  const sun = new THREE.Mesh(sunGeo, sunMat);
  sun.position.set(10, 12, 8);
  sun.lookAt(0, 0, 0);
  envScene.add(sun);

  const rt = pmrem.fromScene(envScene, 0.04);
  skyGeo.dispose();
  skyMat.dispose();
  sunGeo.dispose();
  sunMat.dispose();
  pmrem.dispose();
  return rt.texture;
}

/**
 * Generates a tileable holographic sci-fi laser wave texture (diagonal scanlines + energy shimmer).
 */
export function createLaserGrateTexture(primaryRgb: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 128, 128);

  // Translucent energy curtain
  ctx.fillStyle = `rgba(${primaryRgb}, 0.16)`;
  ctx.fillRect(0, 0, 128, 128);

  // Diagonal holographic tech scanlines
  ctx.strokeStyle = `rgba(${primaryRgb}, 0.42)`;
  ctx.lineWidth = 2.5;
  for (let i = -128; i < 256; i += 18) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 128, 128);
    ctx.stroke();
  }

  // Soft moving scan wave bands
  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, `rgba(${primaryRgb}, 0.05)`);
  grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.32)');
  grad.addColorStop(1, `rgba(${primaryRgb}, 0.05)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export type TerrainSurfaceStyle =
  | 'meadow'
  | 'ember'
  | 'sand-path'
  | 'magma-path'
  | 'wood-plank'
  | 'frost-plank'
  | 'water'
  | 'hazard-line';

function hexToRgbString(hex: number, darken = 1): string {
  const r = Math.max(0, Math.min(255, Math.round(((hex >> 16) & 0xff) * darken)));
  const g = Math.max(0, Math.min(255, Math.round(((hex >> 8) & 0xff) * darken)));
  const b = Math.max(0, Math.min(255, Math.round((hex & 0xff) * darken)));
  return `${r}, ${g}, ${b}`;
}

function drawWrappedCircle(
  ctx: CanvasRenderingContext2D,
  size: number,
  x: number,
  y: number,
  r: number,
  fillStyle: string
): void {
  ctx.fillStyle = fillStyle;
  for (let ox = -size; ox <= size; ox += size) {
    for (let oy = -size; oy <= size; oy += size) {
      const px = x + ox;
      const py = y + oy;
      if (px + r < 0 || px - r > size || py + r < 0 || py - r > size) continue;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawWrappedRect(
  ctx: CanvasRenderingContext2D,
  size: number,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  fillStyle: string,
  strokeStyle?: string
): void {
  for (let ox = -size; ox <= size; ox += size) {
    for (let oy = -size; oy <= size; oy += size) {
      const px = x + ox;
      const py = y + oy;
      if (px + w < 0 || px > size || py + h < 0 || py > size) continue;
      ctx.fillStyle = fillStyle;
      ctx.beginPath();
      ctx.roundRect(px, py, w, h, radius);
      ctx.fill();
      if (strokeStyle) {
        ctx.strokeStyle = strokeStyle;
        ctx.stroke();
      }
    }
  }
}

/**
 * Generates crisp seamlessly tileable procedural surface textures so arenas, paths, planks,
 * and water read as rich stylized game environments rather than tiled grid planes.
 */
export function createTerrainSurfaceTexture(
  style: TerrainSurfaceStyle,
  baseHex: number,
  accentHex: number,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = `rgb(${hexToRgbString(baseHex)})`;
  ctx.fillRect(0, 0, size, size);

  if (style === 'meadow') {
    // Seamless organic moss/turf variation + fine scattered grass blades + pebbles (ZERO grid seams)
    for (let i = 0; i < 42; i += 1) {
      const x = ((i * 73 + 19) % size);
      const y = ((i * 137 + 31) % size);
      const r = 14 + (i % 5) * 6;
      const col = i % 3 === 0
        ? `rgba(${hexToRgbString(accentHex)}, 0.26)`
        : i % 3 === 1
          ? `rgba(${hexToRgbString(baseHex, 1.14)}, 0.22)`
          : `rgba(${hexToRgbString(baseHex, 0.84)}, 0.24)`;
      drawWrappedCircle(ctx, size, x, y, r, col);
    }
    // Scattered sunken mossy flagstone chips
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 12; i += 1) {
      const sx = (i * 89 + 29) % size;
      const sy = (i * 53 + 17) % size;
      const sw = 12 + (i % 3) * 5;
      const sh = 9 + ((i + 1) % 3) * 4;
      drawWrappedRect(
        ctx,
        size,
        sx,
        sy,
        sw,
        sh,
        3,
        'rgba(116, 128, 118, 0.24)',
        'rgba(40, 56, 46, 0.2)'
      );
    }
    // Fine tufted grass blades
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 72; i += 1) {
      const x = (i * 53 + 11) % size;
      const y = (i * 97 + 19) % size;
      ctx.strokeStyle = i % 2 === 0
        ? `rgba(${hexToRgbString(baseHex, 1.24)}, 0.42)`
        : `rgba(${hexToRgbString(accentHex, 0.72)}, 0.45)`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 3, y - 7);
      ctx.moveTo(x + 2, y);
      ctx.lineTo(x + 5, y - 6);
      ctx.stroke();
    }
  } else if (style === 'ember') {
    // Seamless organic volcanic basalt with periodic undulating magma fissures
    for (let i = 0; i < 40; i += 1) {
      const x = (i * 67 + 13) % size;
      const y = (i * 113 + 29) % size;
      const r = 16 + (i % 4) * 7;
      drawWrappedCircle(
        ctx,
        size,
        x,
        y,
        r,
        i % 2 === 0 ? `rgba(${hexToRgbString(baseHex, 0.7)}, 0.42)` : `rgba(${hexToRgbString(baseHex, 1.12)}, 0.22)`
      );
    }
    // Periodic sinusoidal subterranean lava veins (100% seamless across UV wrap)
    ctx.lineWidth = 2.4;
    for (let i = 0; i < 4; i += 1) {
      const baseY = 32 + i * 64;
      ctx.strokeStyle = `rgba(${hexToRgbString(accentHex)}, 0.42)`;
      ctx.beginPath();
      for (let x = 0; x <= size; x += 8) {
        const wy = baseY + Math.sin((x / size) * Math.PI * 2 * (1 + (i % 2)) + i * 1.4) * 14;
        if (x === 0) ctx.moveTo(x, wy);
        else ctx.lineTo(x, wy);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 24; i += 1) {
      const x = (i * 89 + 17) % size;
      const y = (i * 61 + 23) % size;
      drawWrappedCircle(ctx, size, x, y, 2 + (i % 3), `rgba(${hexToRgbString(accentHex)}, 0.38)`);
    }
  } else if (style === 'sand-path') {
    // Natural weathered stone causeway with staggered irregular slate slabs & border trim
    ctx.fillStyle = `rgb(${hexToRgbString(baseHex, 0.82)})`;
    ctx.fillRect(0, 0, size, size);

    // Worn central dust track
    const trackGrad = ctx.createLinearGradient(0, 0, size, 0);
    trackGrad.addColorStop(0, `rgba(${hexToRgbString(accentHex, 0.7)}, 0.5)`);
    trackGrad.addColorStop(0.5, `rgba(${hexToRgbString(baseHex, 1.05)}, 0.45)`);
    trackGrad.addColorStop(1, `rgba(${hexToRgbString(accentHex, 0.7)}, 0.5)`);
    ctx.fillStyle = trackGrad;
    ctx.fillRect(0, 0, size, size);

    // Staggered organic stone slabs (broken sizes & offsets, non-grid feel)
    ctx.lineWidth = 2;
    for (let i = 0; i < 26; i += 1) {
      const rx = ((i * 97 + ((i % 3) * 29)) % (size - 28)) + 14;
      const ry = (i * 59 + 17) % size;
      const rw = 26 + (i % 4) * 11;
      const rh = 18 + ((i * 3) % 3) * 9;
      const shade = 0.88 + (i % 4) * 0.06;
      drawWrappedRect(
        ctx,
        size,
        rx - rw * 0.5,
        ry - rh * 0.5,
        rw,
        rh,
        6,
        `rgba(${hexToRgbString(baseHex, shade)}, 0.72)`,
        `rgba(${hexToRgbString(accentHex, 0.58)}, 0.42)`
      );
    }
    // Dressed stone shoulder borders along left/right edges
    ctx.fillStyle = `rgba(${hexToRgbString(accentHex, 0.75)}, 0.55)`;
    ctx.fillRect(0, 0, 14, size);
    ctx.fillRect(size - 14, 0, 14, size);
  } else if (style === 'magma-path') {
    // Dark charred basalt bridge with glowing molten edge channels & staggered obsidian slabs
    const grad = ctx.createLinearGradient(0, 0, size, 0);
    grad.addColorStop(0, `rgb(${hexToRgbString(accentHex, 0.85)})`);
    grad.addColorStop(0.14, `rgb(${hexToRgbString(baseHex, 0.75)})`);
    grad.addColorStop(0.5, `rgb(${hexToRgbString(baseHex)})`);
    grad.addColorStop(0.86, `rgb(${hexToRgbString(baseHex, 0.75)})`);
    grad.addColorStop(1, `rgb(${hexToRgbString(accentHex, 0.85)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    ctx.lineWidth = 2;
    for (let i = 0; i < 20; i += 1) {
      const rx = 38 + ((i * 73) % (size - 76));
      const ry = (i * 53 + 11) % size;
      const rw = 34 + (i % 3) * 12;
      const rh = 24 + ((i + 1) % 3) * 10;
      drawWrappedRect(
        ctx,
        size,
        rx - rw * 0.5,
        ry - rh * 0.5,
        rw,
        rh,
        7,
        'rgba(41, 37, 36, 0.86)',
        'rgba(249, 115, 22, 0.55)'
      );
    }
  } else if (style === 'wood-plank' || style === 'frost-plank') {
    // Timber / frozen slate wood grain + bolt trim
    for (let i = 0; i < 16; i += 1) {
      const y = i * 16 + 4;
      ctx.fillStyle = i % 2 === 0
        ? `rgba(${hexToRgbString(baseHex, 0.92)}, 0.45)`
        : `rgba(${hexToRgbString(accentHex, 1.06)}, 0.35)`;
      ctx.fillRect(0, y, size, 4);
    }
    if (style === 'frost-plank') {
      // Frosted snow rime edge highlights
      ctx.fillStyle = 'rgba(255, 255, 255, 0.36)';
      ctx.fillRect(0, 0, size, 22);
      ctx.fillRect(0, size - 18, size, 18);
    }
    // Iron rivets / corner brackets
    ctx.fillStyle = style === 'frost-plank' ? 'rgba(100, 116, 139, 0.5)' : 'rgba(92, 61, 30, 0.45)';
    for (const bx of [18, 238]) {
      for (const by of [24, 128, 228]) {
        ctx.beginPath();
        ctx.arc(bx, by, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (style === 'water') {
    // Layered stylized current streaks & soft white seafoam caustics
    for (let i = 0; i < 18; i += 1) {
      const x = (i * 67) % size;
      const y = (i * 41) % size;
      ctx.fillStyle = i % 3 === 0
        ? 'rgba(255, 255, 255, 0.14)'
        : `rgba(${hexToRgbString(accentHex)}, 0.25)`;
      ctx.beginPath();
      ctx.roundRect(x, y, 42 + (i % 3) * 20, 7, 4);
      ctx.fill();
    }
  } else if (style === 'hazard-line') {
    // Glowing diagonal chevron defense barrier stripe
    ctx.fillStyle = `rgb(${hexToRgbString(baseHex)})`;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = `rgba(${hexToRgbString(accentHex)}, 0.72)`;
    for (let x = -size; x < size * 2; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 32, 0);
      ctx.lineTo(x + 64, size);
      ctx.lineTo(x + 32, size);
      ctx.closePath();
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const terrainTextureCache = new Map<string, THREE.CanvasTexture>();
export const SHARED_TERRAIN_TEXTURES = new Set<unknown>();

/**
 * Returns a cached procedural terrain texture so level restarts and swaps avoid
 * redundant 256x256 Canvas redraws & GPU texture uploads.
 */
export function getCachedTerrainSurfaceTexture(
  style: TerrainSurfaceStyle,
  baseHex: number,
  accentHex: number,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const key = `${style}|${baseHex}|${accentHex}|${repeatX}|${repeatY}`;
  const cached = terrainTextureCache.get(key);
  if (cached) return cached;
  const tex = createTerrainSurfaceTexture(style, baseHex, accentHex, repeatX, repeatY);
  terrainTextureCache.set(key, tex);
  SHARED_TERRAIN_TEXTURES.add(tex);
  return tex;
}

export function markCachedTerrainTexturesDirty(): void {
  for (const tex of terrainTextureCache.values()) {
    tex.needsUpdate = true;
  }
}
