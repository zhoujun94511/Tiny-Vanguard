import * as THREE from 'three';

export interface CameraConfig {
  fov: number;
  height: number;
  distance: number;
  minVisibleWidth: number;
  minVisibleDepth: number;
}

export interface GroundViewBounds {
  centerX: number;
  centerZ: number;
  halfWidth: number;
  halfDepth: number;
}

export class CameraController {
  public readonly camera: THREE.PerspectiveCamera;
  private config: CameraConfig = {
    fov: 40,
    height: 18,
    distance: 14,
    minVisibleWidth: 16,
    minVisibleDepth: 15,
  };
  private aspect = 16 / 9;
  private targetX = 0;
  private targetZ = 0;
  private currentX = 0;
  private currentZ = 0;
  private effectiveScale = 1;
  private locked = false;
  private lockedX = 0;
  private lockedZ = 0;
  private shakeIntensity = 0;
  private shakeTime = 0;

  // Scratch vectors to avoid per-frame allocations
  private readonly rayOrigin = new THREE.Vector3();
  private readonly rayDir = new THREE.Vector3();
  private readonly ndcCorners = [
    new THREE.Vector2(-1, -1),
    new THREE.Vector2(1, -1),
    new THREE.Vector2(-1, 1),
    new THREE.Vector2(1, 1),
  ];

  private readonly viewBounds: GroundViewBounds = {
    centerX: 0,
    centerZ: 0,
    halfWidth: 12,
    halfDepth: 10,
  };

  constructor(aspect = 16 / 9) {
    this.aspect = Math.max(0.25, aspect);
    this.camera = new THREE.PerspectiveCamera(this.config.fov, this.aspect, 0.5, 140);
    this.snapTo(0, 0);
  }

  public configure(cfg: CameraConfig, locked = false, lockX = 0, lockZ = 0): void {
    this.config = { ...cfg };
    this.camera.fov = cfg.fov;
    this.locked = locked;
    this.lockedX = lockX;
    this.lockedZ = lockZ;
    this.recomputeScale();
    this.snapTo(locked ? lockX : this.targetX, locked ? lockZ : this.targetZ);
  }

  public resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.aspect = width / height;
    this.camera.aspect = this.aspect;
    this.recomputeScale();
    this.camera.updateProjectionMatrix();
    this.applyTransform();
    this.updateGroundViewBounds();
  }

  private recomputeScale(): void {
    // Base visible height at ground with default distance/height
    const pitchRad = Math.atan2(this.config.height, this.config.distance);
    const slantDist = Math.hypot(this.config.height, this.config.distance);
    const vFovRad = THREE.MathUtils.degToRad(this.config.fov);
    const baseDepth = (2 * slantDist * Math.tan(vFovRad * 0.5)) / Math.max(0.35, Math.sin(pitchRad));
    const baseWidth = 2 * slantDist * Math.tan(vFovRad * 0.5) * this.aspect;

    const needW = this.config.minVisibleWidth / Math.max(1, baseWidth);
    const needD = this.config.minVisibleDepth / Math.max(1, baseDepth);
    // Allow up to 2.15x zoom-out on narrow portrait phones (e.g. 360x800, 390x844) so full bridge & lane threats stay visible
    this.effectiveScale = THREE.MathUtils.clamp(Math.max(1, needW, needD), 1, 2.15);
  }

  public getEffectiveScale(): number {
    return this.effectiveScale;
  }

  public snapTo(x: number, z: number): void {
    this.targetX = x;
    this.targetZ = z;
    this.currentX = x;
    this.currentZ = z;
    this.applyTransform();
    this.updateGroundViewBounds();
  }

  public setTarget(x: number, z: number): void {
    if (this.locked) {
      this.targetX = this.lockedX;
      this.targetZ = this.lockedZ;
      return;
    }
    this.targetX = x;
    this.targetZ = z;
  }

  public addShake(amount: number): void {
    this.shakeIntensity = Math.min(0.32, Math.max(this.shakeIntensity, amount));
  }

  public update(dt: number): void {
    const t = 1 - Math.exp(-22 * dt);
    this.currentX += (this.targetX - this.currentX) * t;
    this.currentZ += (this.targetZ - this.currentZ) * t;
    if (this.shakeIntensity > 0.002) {
      this.shakeTime += dt * 45;
      this.shakeIntensity *= Math.exp(-10 * dt);
    } else {
      this.shakeIntensity = 0;
    }
    this.applyTransform();
    this.updateGroundViewBounds();
  }

  private applyTransform(): void {
    const h = this.config.height * this.effectiveScale;
    const d = this.config.distance * this.effectiveScale;
    const sx = this.shakeIntensity > 0 ? Math.sin(this.shakeTime * 1.7) * this.shakeIntensity : 0;
    const sz = this.shakeIntensity > 0 ? Math.cos(this.shakeTime * 2.3) * this.shakeIntensity : 0;
    this.camera.position.set(this.currentX + sx, h, this.currentZ + d + sz);
    this.camera.lookAt(this.currentX + sx * 0.5, 0.5, this.currentZ + sz * 0.5);
    this.camera.updateMatrixWorld();
  }

  private updateGroundViewBounds(): void {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (let i = 0; i < 4; i += 1) {
      const c = this.ndcCorners[i];
      this.rayOrigin.set(c.x, c.y, 0.5).unproject(this.camera);
      this.rayDir.copy(this.rayOrigin).sub(this.camera.position).normalize();
      if (this.rayDir.y < -0.02) {
        const dist = -this.camera.position.y / this.rayDir.y;
        const gx = this.camera.position.x + this.rayDir.x * dist;
        const gz = this.camera.position.z + this.rayDir.z * dist;
        if (gx < minX) minX = gx;
        if (gx > maxX) maxX = gx;
        if (gz < minZ) minZ = gz;
        if (gz > maxZ) maxZ = gz;
      }
    }

    if (Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minZ) && Number.isFinite(maxZ)) {
      this.viewBounds.centerX = (minX + maxX) * 0.5;
      this.viewBounds.centerZ = (minZ + maxZ) * 0.5;
      this.viewBounds.halfWidth = Math.max(8, (maxX - minX) * 0.5);
      this.viewBounds.halfDepth = Math.max(8, (maxZ - minZ) * 0.5);
    } else {
      this.viewBounds.centerX = this.currentX;
      this.viewBounds.centerZ = this.currentZ;
      this.viewBounds.halfWidth = 12;
      this.viewBounds.halfDepth = 10;
    }
  }

  public getGroundViewBounds(): Readonly<GroundViewBounds> {
    return this.viewBounds;
  }
}
