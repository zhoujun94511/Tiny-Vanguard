import * as THREE from 'three';

/**
 * Recursively disposes geometries, InstancedMesh GPU buffers, materials, and textures
 * under a Three.js Object3D subtree, skipping any explicitly protected shared GPU resources.
 */
export function disposeObjectSubtree(
  root: THREE.Object3D,
  sharedResources?: ReadonlySet<unknown>
): void {
  root.traverse((obj) => {
    const inst = obj as THREE.InstancedMesh;
    if (inst.isInstancedMesh && typeof inst.dispose === 'function' && !sharedResources?.has(inst)) {
      inst.dispose();
    }
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry && !sharedResources?.has(mesh.geometry)) {
      mesh.geometry.dispose();
    }
    const mat = mesh.material;
    if (Array.isArray(mat)) {
      for (const m of mat) {
        disposeMaterial(m, sharedResources);
      }
    } else if (mat) {
      disposeMaterial(mat, sharedResources);
    }
  });
}

function disposeMaterial(mat: THREE.Material, sharedResources?: ReadonlySet<unknown>): void {
  if (sharedResources?.has(mat)) return;
  const std = mat as THREE.MeshStandardMaterial;
  if (std.map && !sharedResources?.has(std.map)) {
    std.map.dispose();
  }
  if (std.emissiveMap && !sharedResources?.has(std.emissiveMap)) {
    std.emissiveMap.dispose();
  }
  if (std.roughnessMap && !sharedResources?.has(std.roughnessMap)) {
    std.roughnessMap.dispose();
  }
  mat.dispose();
}
