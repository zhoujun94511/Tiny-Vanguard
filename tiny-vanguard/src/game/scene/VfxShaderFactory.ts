import * as THREE from 'three';

let cachedGlowTex: THREE.CanvasTexture | null = null;
let cachedFlareTex: THREE.CanvasTexture | null = null;
let cachedTrailTex: THREE.CanvasTexture | null = null;

/**
 * 64x64 radial additive soft-bloom glow sprite texture (white hot core -> smooth halo).
 */
export function getVfxGlowTexture(): THREE.CanvasTexture {
  if (cachedGlowTex) return cachedGlowTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.24, 'rgba(255, 255, 255, 0.82)');
  grad.addColorStop(0.55, 'rgba(255, 255, 255, 0.25)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedGlowTex = tex;
  return tex;
}

/**
 * 64x64 4-point star flare texture for crisp impact sparks and crit flashes.
 */
export function getVfxFlareTexture(): THREE.CanvasTexture {
  if (cachedFlareTex) return cachedFlareTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 1, 32, 32, 26);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.55)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);

  // Sharp horizontal & vertical flare spikes
  ctx.save();
  ctx.translate(32, 32);
  for (let i = 0; i < 2; i += 1) {
    ctx.rotate((i * Math.PI) / 2);
    const sg = ctx.createLinearGradient(-30, 0, 30, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(0.5, 'rgba(255,255,255,0.95)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(-30, -2.2, 60, 4.4);
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedFlareTex = tex;
  return tex;
}

/**
 * 64x64 directional plasma trail texture (bright leading core along +U, soft trailing fade).
 */
export function getVfxTrailTexture(): THREE.CanvasTexture {
  if (cachedTrailTex) return cachedTrailTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  // Vertical core thickness falloff
  const vGrad = ctx.createLinearGradient(0, 0, 0, 64);
  vGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  vGrad.addColorStop(0.35, 'rgba(255, 255, 255, 0.55)');
  vGrad.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
  vGrad.addColorStop(0.65, 'rgba(255, 255, 255, 0.55)');
  vGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, 64, 64);

  // Horizontal alpha taper (soft ends)
  ctx.globalCompositeOperation = 'destination-in';
  const hGrad = ctx.createLinearGradient(0, 0, 64, 0);
  hGrad.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
  hGrad.addColorStop(0.18, 'rgba(255, 255, 255, 1)');
  hGrad.addColorStop(0.82, 'rgba(255, 255, 255, 1)');
  hGrad.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
  ctx.fillStyle = hGrad;
  ctx.fillRect(0, 0, 64, 64);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedTrailTex = tex;
  return tex;
}

export function markVfxTexturesDirty(): void {
  if (cachedGlowTex) cachedGlowTex.needsUpdate = true;
  if (cachedFlareTex) cachedFlareTex.needsUpdate = true;
  if (cachedTrailTex) cachedTrailTex.needsUpdate = true;
}

/**
 * Injects lightweight Fresnel Rim Lighting into any MeshStandardMaterial
 * so 3D characters and enemies exhibit crisp specular edge separation against the arena floor.
 */
export function applyFresnelRim(
  mat: THREE.MeshStandardMaterial,
  rimColorHex = 0x7dd3fc,
  rimPower = 2.6,
  rimStrength = 0.58
): THREE.MeshStandardMaterial {
  const c = new THREE.Color(rimColorHex);
  const r = c.r.toFixed(3);
  const g = c.g.toFixed(3);
  const b = c.b.toFixed(3);
  const pw = rimPower.toFixed(2);
  const st = rimStrength.toFixed(2);

  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <color_vertex>',
      `
      #include <color_vertex>
      #if defined( USE_COLOR ) && defined( USE_INSTANCING_COLOR )
        float chromaV = max( color.r, max( color.g, color.b ) ) - min( color.r, min( color.g, color.b ) );
        float isFlashV = step( 0.95, min( instanceColor.r, min( instanceColor.g, instanceColor.b ) ) );
        float isChromaAccent = smoothstep( 0.08, 0.22, chromaV );
        vColor.xyz = mix( vColor.xyz, color.xyz, isChromaAccent * 0.78 * ( 1.0 - isFlashV ) );
      #endif
      `
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
      vec3 rimN = normalize(vNormal);
      vec3 rimV = normalize(vViewPosition);
      float rimF = pow(1.0 - clamp(abs(dot(rimN, rimV)), 0.0, 1.0), ${pw});
      gl_FragColor.rgb += vec3(${r}, ${g}, ${b}) * rimF * ${st};
      #include <dithering_fragment>
      `
    );
  };
  mat.customProgramCacheKey = () => `rim_${rimColorHex}_${pw}_${st}`;
  return mat;
}

/**
 * Single-pass GLSL Fragment Shader for glowing animated ground shockwaves:
 * style 0 = Frost jagged crystalline shockwave
 * style 1 = Solar / Fury supernova energy blast
 * style 2 = Electric / Supply / Holy arc pulse
 */
export function createShockwaveShaderMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x67e8f9) },
      uStyle: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uProgress;
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uStyle;
      varying vec2 vUv;

      void main() {
        float dist = length(vUv);
        if (dist > 1.0) discard;
        float ang = atan(vUv.y, vUv.x);

        // Procedural angular distortion (jagged ice spikes / plasma ripples / arc pulses)
        float spikes = uStyle < 0.5
          ? sin(ang * 12.0 + uTime * 3.0) * 0.045 + sin(ang * 24.0 - uTime * 5.0) * 0.02
          : uStyle < 1.5
            ? sin(ang * 8.0 - uTime * 6.0) * 0.035 + cos(ang * 16.0 + uTime * 8.0) * 0.018
            : sin(ang * 18.0 + uTime * 10.0) * 0.03;

        float edge = clamp(uProgress, 0.05, 1.0);
        float d = dist + spikes * (1.0 - uProgress * 0.4);

        // Bright thin leading rim + soft trailing energy band
        float rimWidth = mix(0.18, 0.08, uProgress);
        float outerRing = smoothstep(edge - rimWidth, edge - 0.015, d) * (1.0 - smoothstep(edge - 0.01, edge + 0.025, d));
        float innerMist = smoothstep(edge * 0.35, edge, d) * (1.0 - smoothstep(edge, edge + 0.02, d)) * 0.38;
        float secondEcho = smoothstep(edge * 0.68 - 0.05, edge * 0.68, d) * (1.0 - smoothstep(edge * 0.68, edge * 0.68 + 0.04, d)) * 0.55;

        float fade = pow(1.0 - uProgress, 1.15);
        float intensity = (outerRing * 1.45 + innerMist + secondEcho) * fade;
        if (intensity <= 0.005) discard;

        // Hot white leading core blending into colored energy halo
        vec3 hotCore = mix(uColor, vec3(1.0, 0.98, 0.95), clamp(outerRing * 0.85, 0.0, 0.88));
        gl_FragColor = vec4(hotCore * intensity, clamp(intensity, 0.0, 1.0));
      }
    `,
  });
}

/**
 * Single-pass GLSL rotating energy orbital track for Orbit Shields.
 */
export function createOrbitTrackShaderMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0x38bdf8) },
      uIntensity: { value: 0.85 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec2 vUv;

      void main() {
        float dist = length(vUv);
        if (dist > 1.0 || dist < 0.72) discard;
        float ang = atan(vUv.y, vUv.x);

        // Dual counter-rotating energy sweeps + fine dashed rune ring
        float ringMask = smoothstep(0.74, 0.88, dist) * (1.0 - smoothstep(0.91, 1.0, dist));
        float sweepA = pow(0.5 + 0.5 * sin(ang * 2.0 - uTime * 4.5), 3.0);
        float sweepB = pow(0.5 + 0.5 * sin(ang * 3.0 + uTime * 3.2), 4.0) * 0.65;
        float runes = step(0.25, sin(ang * 24.0 - uTime * 2.0)) * 0.35;

        float alpha = ringMask * (0.28 + sweepA * 0.85 + sweepB + runes) * uIntensity;
        if (alpha <= 0.01) discard;
        vec3 col = mix(uColor, vec3(0.95, 0.99, 1.0), clamp(sweepA * 0.65, 0.0, 0.75));
        gl_FragColor = vec4(col * alpha, clamp(alpha, 0.0, 1.0));
      }
    `,
  });
}

/**
 * Vertical holographic / celestial energy pillar shader (Supply Beacon & Fury Starfall).
 */
export function createBeaconPillarMaterial(colorHex = 0x38bdf8, opacity = 0.65): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(colorHex) },
      uOpacity: { value: opacity },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNorm;
      varying vec3 vView;
      void main() {
        vUv = uv;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vNorm = normalize(normalMatrix * normal);
        vView = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vNorm;
      varying vec3 vView;

      void main() {
        float verticalFade = pow(1.0 - vUv.y, 1.45) * smoothstep(0.0, 0.08, vUv.y);
        float centerCore = pow(abs(dot(normalize(vNorm), normalize(vView))), 1.35);
        float scan = 0.78 + 0.22 * sin(vUv.y * 28.0 - uTime * 9.0);
        float alpha = verticalFade * (0.25 + centerCore * 0.95) * scan * uOpacity;
        if (alpha <= 0.005) discard;
        vec3 col = mix(uColor, vec3(1.0), centerCore * 0.55);
        gl_FragColor = vec4(col * alpha, clamp(alpha, 0.0, 1.0));
      }
    `,
  });
}
