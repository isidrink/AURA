"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type Avatar3DProps = {
  audioLevelRef: MutableRefObject<number>;
  speakingRef: MutableRefObject<boolean>;
};

type MorphMesh = THREE.Mesh & {
  morphTargetDictionary?: Record<string, number>;
  morphTargetInfluences?: number[];
};

const MORPH_NAMES = [
  "JawOpen",
  "Viseme_A",
  "Viseme_E",
  "Viseme_O",
  "MouthSmile",
] as const;

export default function Avatar3D({
  audioLevelRef,
  speakingRef,
}: Avatar3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
    camera.position.set(0, 1.42, 5.25);
    camera.lookAt(0, 1.42, 0);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xf6e7d4, 0x13213a, 2.4));
    const warmLight = new THREE.DirectionalLight(0xffc6aa, 3.6);
    warmLight.position.set(-3, 4, 4);
    scene.add(warmLight);
    const cyanLight = new THREE.DirectionalLight(0x35d8dc, 2.8);
    cyanLight.position.set(4, 2, -1);
    scene.add(cyanLight);

    const avatarRoot = new THREE.Group();
    scene.add(avatarRoot);

    const morphMeshes: MorphMesh[] = [];
    const leftEyeParts: THREE.Object3D[] = [];
    const rightEyeParts: THREE.Object3D[] = [];
    let model: THREE.Object3D | null = null;
    let destroyed = false;
    let smoothedLevel = 0;
    let frameId = 0;
    const clock = new THREE.Clock();

    const loader = new GLTFLoader();
    loader.load(
      "/AURA_RealTime_Avatar.glb",
      (gltf) => {
        if (destroyed) return;
        model = gltf.scene;
        model.traverse((object) => {
          const mesh = object as MorphMesh;
          if (mesh.isMesh) {
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
              morphMeshes.push(mesh);
            }
          }
          if (["LeftEye", "LeftIris", "LeftPupil"].includes(object.name)) {
            leftEyeParts.push(object);
          }
          if (["RightEye", "RightIris", "RightPupil"].includes(object.name)) {
            rightEyeParts.push(object);
          }
        });
        avatarRoot.add(model);
      },
      undefined,
      () => host.classList.add("avatar-load-error"),
    );

    const setMorph = (name: string, value: number) => {
      for (const mesh of morphMeshes) {
        const index = mesh.morphTargetDictionary?.[name];
        if (index !== undefined && mesh.morphTargetInfluences) {
          mesh.morphTargetInfluences[index] = THREE.MathUtils.clamp(value, 0, 1);
        }
      }
    };

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const render = () => {
      frameId = requestAnimationFrame(render);
      const elapsed = clock.getElapsedTime();
      const speaking = speakingRef.current;
      const requestedLevel = speaking
        ? THREE.MathUtils.clamp(audioLevelRef.current * 9.5, 0, 1)
        : 0;
      smoothedLevel = THREE.MathUtils.lerp(
        smoothedLevel,
        requestedLevel,
        requestedLevel > smoothedLevel ? 0.42 : 0.2,
      );

      const syllable = (Math.sin(elapsed * 15.5) + 1) * 0.5;
      const secondary = (Math.sin(elapsed * 11.2 + 1.8) + 1) * 0.5;
      setMorph("JawOpen", smoothedLevel * (0.55 + syllable * 0.45));
      setMorph("Viseme_A", smoothedLevel * syllable * 0.72);
      setMorph("Viseme_E", smoothedLevel * secondary * 0.42);
      setMorph("Viseme_O", smoothedLevel * (1 - syllable) * 0.5);
      setMorph("MouthSmile", speaking ? 0.08 : 0.17);

      const blinkPhase = elapsed % 4.3;
      const blink = blinkPhase > 4.08
        ? Math.sin(((blinkPhase - 4.08) / 0.22) * Math.PI)
        : 0;
      for (const eye of [...leftEyeParts, ...rightEyeParts]) {
        eye.scale.y = Math.max(0.08, 1 - blink * 0.92);
      }

      avatarRoot.position.y = Math.sin(elapsed * 1.35) * 0.008;
      avatarRoot.rotation.y = Math.sin(elapsed * 0.42) * 0.018;
      avatarRoot.rotation.x = Math.sin(elapsed * 0.31) * 0.004;
      renderer.render(scene, camera);
    };
    render();

    return () => {
      destroyed = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
      model?.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : mesh.material
            ? [mesh.material]
            : [];
        materials.forEach((material) => material.dispose());
      });
    };
  }, [audioLevelRef, speakingRef]);

  return (
    <div
      ref={hostRef}
      className="avatar-canvas"
      role="img"
      aria-label="Modelo 3D animado de Aura"
    />
  );
}
