"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type Viseme =
  | "sil" | "PP" | "FF" | "TH" | "DD" | "kk" | "CH" | "SS"
  | "nn" | "RR" | "aa" | "E" | "I" | "O" | "U";

type Avatar3DProps = {
  audioLevelRef: MutableRefObject<number>;
  audioFeaturesRef: MutableRefObject<{
    rms: number;
    zcr: number;
    low: number;
    mid: number;
    high: number;
    viseme: Viseme;
  }>;
  visemeWeightsRef: MutableRefObject<Record<Viseme, number>>;
  speakingRef: MutableRefObject<boolean>;
};

type MorphMesh = THREE.SkinnedMesh & {
  morphTargetDictionary?: Record<string, number>;
  morphTargetInfluences?: number[];
};

const VISEME_POSES: Record<Viseme, {
  jaw: number; funnel: number; pucker: number; stretch: number;
  upper: number; lower: number; press: number; close: number;
}> = {
  sil: { jaw: 0, funnel: 0, pucker: 0, stretch: 0, upper: 0, lower: 0, press: 0, close: 0 },
  PP: { jaw: .02, funnel: 0, pucker: .08, stretch: 0, upper: 0, lower: 0, press: .52, close: .72 },
  FF: { jaw: .13, funnel: 0, pucker: 0, stretch: .12, upper: .06, lower: .1, press: .2, close: .08 },
  TH: { jaw: .2, funnel: .04, pucker: 0, stretch: .08, upper: .08, lower: .16, press: 0, close: 0 },
  DD: { jaw: .23, funnel: 0, pucker: 0, stretch: .1, upper: .05, lower: .08, press: .08, close: 0 },
  kk: { jaw: .31, funnel: .02, pucker: 0, stretch: .08, upper: 0, lower: .12, press: 0, close: 0 },
  CH: { jaw: .25, funnel: .14, pucker: .12, stretch: .06, upper: 0, lower: .1, press: .06, close: 0 },
  SS: { jaw: .12, funnel: 0, pucker: 0, stretch: .3, upper: .08, lower: .04, press: .1, close: .04 },
  nn: { jaw: .17, funnel: 0, pucker: 0, stretch: .08, upper: .03, lower: .04, press: .08, close: 0 },
  RR: { jaw: .29, funnel: .1, pucker: .06, stretch: .05, upper: 0, lower: .1, press: 0, close: 0 },
  aa: { jaw: .82, funnel: .05, pucker: 0, stretch: .08, upper: .08, lower: .27, press: 0, close: 0 },
  E: { jaw: .39, funnel: 0, pucker: 0, stretch: .45, upper: .14, lower: .1, press: 0, close: 0 },
  I: { jaw: .25, funnel: 0, pucker: 0, stretch: .58, upper: .18, lower: .06, press: 0, close: 0 },
  O: { jaw: .48, funnel: .62, pucker: .22, stretch: 0, upper: 0, lower: .16, press: 0, close: 0 },
  U: { jaw: .29, funnel: .34, pucker: .68, stretch: 0, upper: 0, lower: .08, press: 0, close: 0 },
};

export default function Avatar3D({
  audioLevelRef,
  audioFeaturesRef,
  visemeWeightsRef,
  speakingRef,
}: Avatar3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(31, 1, 0.01, 100);
    camera.position.set(0, 1.18, 3.15);
    camera.lookAt(0, 1.12, 0);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xfff1e6, 0x17243a, 2.6));
    const key = new THREE.DirectionalLight(0xffdfcf, 4.2);
    key.position.set(-2.5, 4, 3.5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x72dce6, 2.2);
    fill.position.set(3, 2.5, 1);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xff8b62, 2.4);
    rim.position.set(-1, 2, -3);
    scene.add(rim);

    const avatarRoot = new THREE.Group();
    scene.add(avatarRoot);

    const morphMeshes: MorphMesh[] = [];
    let model: THREE.Object3D | null = null;
    let headBone: THREE.Object3D | null = null;
    let chestBone: THREE.Object3D | null = null;
    let hipsBone: THREE.Object3D | null = null;
    let leftShoulder: THREE.Object3D | null = null;
    let rightShoulder: THREE.Object3D | null = null;
    let leftArm: THREE.Object3D | null = null;
    let rightArm: THREE.Object3D | null = null;
    let leftForeArm: THREE.Object3D | null = null;
    let rightForeArm: THREE.Object3D | null = null;
    let leftEye: THREE.Object3D | null = null;
    let rightEye: THREE.Object3D | null = null;
    const baseRotations = new Map<THREE.Object3D, THREE.Quaternion>();
    const poseRotation = new THREE.Quaternion();
    let frameId = 0;
    let destroyed = false;
    let smoothedLevel = 0;
    let noiseFloor = 0.00025;
    let observedPeak = 0.008;
    const mouthValues = {
      jaw: 0,
      funnel: 0,
      pucker: 0,
      stretch: 0,
      upper: 0,
      lower: 0,
      press: 0,
      close: 0,
    };
    let nextBlink = 2.5;
    const clock = new THREE.Clock();

    const setMorph = (name: string, value: number) => {
      for (const mesh of morphMeshes) {
        const index = mesh.morphTargetDictionary?.[name];
        if (index !== undefined && mesh.morphTargetInfluences) {
          mesh.morphTargetInfluences[index] = THREE.MathUtils.clamp(value, 0, 1);
        }
      }
    };

    const loader = new GLTFLoader();
    loader.load(
      "/AURA_Avatar.glb",
      (gltf) => {
        if (destroyed) return;
        model = gltf.scene;
        model.traverse((object) => {
          const mesh = object as MorphMesh;
          if (
            mesh.isMesh &&
            mesh.morphTargetDictionary &&
            mesh.morphTargetInfluences
          ) {
            morphMeshes.push(mesh);
          }
          if (object.name === "Head") headBone = object;
          if (object.name === "Spine2") chestBone = object;
          if (object.name === "Hips") hipsBone = object;
          if (object.name === "LeftShoulder") leftShoulder = object;
          if (object.name === "RightShoulder") rightShoulder = object;
          if (object.name === "LeftArm") leftArm = object;
          if (object.name === "RightArm") rightArm = object;
          if (object.name === "LeftForeArm") leftForeArm = object;
          if (object.name === "RightForeArm") rightForeArm = object;
          if (object.name === "LeftEye") leftEye = object;
          if (object.name === "RightEye") rightEye = object;
        });
        [
          headBone,
          chestBone,
          hipsBone,
          leftShoulder,
          rightShoulder,
          leftArm,
          rightArm,
          leftForeArm,
          rightForeArm,
          leftEye,
          rightEye,
        ].forEach((bone) => {
          if (bone) baseRotations.set(bone, bone.quaternion.clone());
        });
        avatarRoot.add(model);
        host.classList.add("is-loaded");
      },
      undefined,
      () => host.classList.add("avatar-load-error"),
    );

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
      const features = audioFeaturesRef.current;
      const rms = audioLevelRef.current;

      if (speaking) {
        observedPeak = Math.max(rms, observedPeak * 0.985);
        if (rms < observedPeak * 0.16) {
          noiseFloor = THREE.MathUtils.lerp(noiseFloor, rms, 0.018);
        }
      }

      const normalizedLevel = speaking || rms > noiseFloor * 1.8
        ? THREE.MathUtils.clamp(
            (rms - Math.max(0.00035, noiseFloor * 1.15)) /
              Math.max(0.0025, observedPeak * 0.78 - noiseFloor),
            0,
            1,
          )
        : 0;
      // Ruta de seguridad: Retell puede entregar PCM con amplitudes muy bajas
      // según navegador y dispositivo. Este nivel garantiza movimiento visible
      // aunque la calibración dinámica o el detector fonético no se inicialicen.
      const directAudioLevel =
        rms < Math.max(0.00055, noiseFloor * 1.4)
          ? 0
          : THREE.MathUtils.clamp(rms * 34, 0, 1);
      /*
       * Algunos navegadores reproducen la pista remota de Retell pero no
       * entregan muestras utilizables al AnalyserNode. En ese caso usamos una
       * cadencia de emergencia mientras agent_start_talking está activo.
       * La combinación de tres oscilaciones evita un abrir/cerrar mecánico.
       */
      const pcmUnavailable = rms < 0.00055;
      const fallbackSpeechLevel =
        speaking && pcmUnavailable
          ? THREE.MathUtils.clamp(
              0.34 +
                Math.sin(elapsed * 13.7) * 0.22 +
                Math.sin(elapsed * 21.1 + 0.8) * 0.13 +
                Math.sin(elapsed * 7.3 + 2.1) * 0.09,
              0.08,
              0.78,
            )
          : 0;
      const detectedLevel = Math.max(
        normalizedLevel,
        directAudioLevel,
        fallbackSpeechLevel,
      );
      const requestedLevel =
        detectedLevel < 0.018
          ? 0
          : THREE.MathUtils.smoothstep(detectedLevel, 0.018, 0.9);
      smoothedLevel = THREE.MathUtils.lerp(
        smoothedLevel,
        requestedLevel,
        requestedLevel > smoothedLevel ? 0.58 : 0.32,
      );

      const neuralWeights = visemeWeightsRef.current;
      const neuralAmount = (Object.keys(neuralWeights) as Viseme[])
        .filter((viseme) => viseme !== "sil")
        .reduce((sum, viseme) => sum + neuralWeights[viseme], 0);
      const pose =
        neuralAmount > 0.002
          ? (Object.keys(neuralWeights) as Viseme[]).reduce(
              (mixed, viseme) => {
                if (viseme === "sil") return mixed;
                const weight =
                  neuralWeights[viseme] / Math.max(1, neuralAmount);
                const source = VISEME_POSES[viseme];
                mixed.jaw += source.jaw * weight;
                mixed.funnel += source.funnel * weight;
                mixed.pucker += source.pucker * weight;
                mixed.stretch += source.stretch * weight;
                mixed.upper += source.upper * weight;
                mixed.lower += source.lower * weight;
                mixed.press += source.press * weight;
                mixed.close += source.close * weight;
                return mixed;
              },
              { jaw: 0, funnel: 0, pucker: 0, stretch: 0, upper: 0, lower: 0, press: 0, close: 0 },
            )
          : VISEME_POSES[features.viseme] ?? VISEME_POSES.sil;
      const usingNeuralVisemes = neuralAmount > 0.002;
      const visemeWeight = (viseme: Viseme) =>
        usingNeuralVisemes
          ? neuralWeights[viseme] / Math.max(1, neuralAmount)
          : features.viseme === viseme
            ? 1
            : 0;
      const closureWeight = usingNeuralVisemes
        ? THREE.MathUtils.clamp(
            neuralWeights.PP + neuralWeights.FF * 0.24 + neuralWeights.SS * 0.12,
            0,
            1,
          )
        : features.viseme === "PP"
          ? 1
          : 0;
      const speechActive =
        smoothedLevel > 0.012 ||
        (speaking && features.viseme !== "sil");
      const immediateJaw = speechActive
        ? THREE.MathUtils.clamp(
            0.025 + smoothedLevel * 0.5,
            0,
            0.56,
          )
        : 0;
      const jawFromAudio =
        immediateJaw *
        (1 - closureWeight * 0.88) *
        (0.42 + pose.jaw * 0.92);
      const jawTarget = speechActive
        ? Math.max(
            jawFromAudio,
            closureWeight > 0.45
              ? 0.025
              : 0.055 + smoothedLevel * 0.22,
          )
        : 0;
      const lipArticulation = speechActive
        ? usingNeuralVisemes
          ? 0.92 + smoothedLevel * 0.24
          : 0.78 + smoothedLevel * 0.38
        : 0;
      const targets = {
        jaw: jawTarget,
        funnel: pose.funnel * lipArticulation * (1 - closureWeight),
        pucker: pose.pucker * lipArticulation * (1 - closureWeight),
        stretch:
          pose.stretch *
          lipArticulation *
          (1 - Math.max(closureWeight, pose.pucker * 0.6)),
        upper: pose.upper * lipArticulation,
        lower:
          pose.lower *
          lipArticulation *
          THREE.MathUtils.clamp(jawTarget * 2.2, 0, 1),
        press: Math.max(
          pose.press * lipArticulation,
          closureWeight * 0.36,
        ),
        close: closureWeight * 0.42,
      };
      const smoothMouth = (key: keyof typeof mouthValues, target: number) => {
        const current = mouthValues[key];
        const isJaw = key === "jaw";
        const factor = target > current
          ? isJaw ? 0.82 : 0.58
          : isJaw ? 0.62 : 0.42;
        mouthValues[key] = THREE.MathUtils.lerp(current, target, factor);
      };
      smoothMouth("jaw", targets.jaw);
      smoothMouth("funnel", targets.funnel);
      smoothMouth("pucker", targets.pucker);
      smoothMouth("stretch", targets.stretch);
      smoothMouth("upper", targets.upper);
      smoothMouth("lower", targets.lower);
      smoothMouth("press", targets.press);
      smoothMouth("close", targets.close);

      setMorph("jawOpen", mouthValues.jaw);
      setMorph("mouthFunnel", mouthValues.funnel);
      setMorph("mouthPucker", mouthValues.pucker);
      setMorph("mouthStretchLeft", mouthValues.stretch);
      setMorph("mouthStretchRight", mouthValues.stretch);
      setMorph("mouthUpperUpLeft", mouthValues.upper);
      setMorph("mouthUpperUpRight", mouthValues.upper);
      setMorph("mouthLowerDownLeft", mouthValues.lower);
      setMorph("mouthLowerDownRight", mouthValues.lower);
      setMorph("mouthPressLeft", mouthValues.press);
      setMorph("mouthPressRight", mouthValues.press);
      setMorph("mouthClose", mouthValues.close);
      setMorph(
        "mouthRollLower",
        visemeWeight("FF") * 0.48 +
          visemeWeight("PP") * 0.12,
      );
      setMorph(
        "mouthRollUpper",
        visemeWeight("PP") * 0.2,
      );
      setMorph(
        "mouthShrugLower",
        visemeWeight("TH") * 0.2 +
          visemeWeight("DD") * 0.08,
      );
      setMorph(
        "mouthShrugUpper",
        (visemeWeight("O") + visemeWeight("U")) * 0.16,
      );
      const vowelSmile =
        visemeWeight("E") * 0.22 +
        visemeWeight("I") * 0.3;
      setMorph("mouthSmileLeft", speaking ? vowelSmile : 0.14);
      setMorph("mouthSmileRight", speaking ? vowelSmile : 0.14);

      if (elapsed > nextBlink) nextBlink = elapsed + 3.2 + Math.random() * 2.4;
      const blinkDistance = nextBlink - elapsed;
      const blink =
        blinkDistance < 0.16
          ? Math.sin(((0.16 - blinkDistance) / 0.16) * Math.PI)
          : 0;
      setMorph("eyeBlinkLeft", blink);
      setMorph("eyeBlinkRight", blink);

      const applyPose = (
        bone: THREE.Object3D | null,
        x = 0,
        y = 0,
        z = 0,
      ) => {
        if (!bone) return;
        const base = baseRotations.get(bone);
        if (!base) return;
        poseRotation.setFromEuler(new THREE.Euler(x, y, z, "XYZ"));
        bone.quaternion.copy(base).multiply(poseRotation);
      };

      const breath = (Math.sin(elapsed * 1.55) + 1) * 0.5;
      const sway = Math.sin(elapsed * 0.55);
      const conversationalNod = speaking ? Math.sin(elapsed * 2.05) * 0.007 : 0;

      // Convierte la T-pose en una postura relajada, con los brazos junto al cuerpo.
      applyPose(leftArm, THREE.MathUtils.degToRad(78 + breath * 0.35), 0, 0);
      applyPose(rightArm, THREE.MathUtils.degToRad(78 + breath * 0.35), 0, 0);
      applyPose(leftForeArm, THREE.MathUtils.degToRad(10), 0, THREE.MathUtils.degToRad(2));
      applyPose(rightForeArm, THREE.MathUtils.degToRad(10), 0, THREE.MathUtils.degToRad(-2));

      applyPose(leftShoulder, breath * 0.003, 0, -breath * 0.002);
      applyPose(rightShoulder, breath * 0.003, 0, breath * 0.002);
      applyPose(chestBone, breath * 0.009, 0, sway * 0.0035);
      applyPose(hipsBone, 0, 0, -sway * 0.002);
      applyPose(
        headBone,
        Math.sin(elapsed * 0.31) * 0.009 + conversationalNod,
        Math.sin(elapsed * 0.43) * 0.025,
        -sway * 0.003,
      );

      const eyeX = Math.sin(elapsed * 0.28) * 0.035;
      applyPose(leftEye, 0, eyeX, 0);
      applyPose(rightEye, 0, eyeX, 0);
      avatarRoot.position.y = Math.sin(elapsed * 1.25) * 0.003;
      avatarRoot.rotation.y = sway * 0.006;

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
  }, [audioFeaturesRef, audioLevelRef, speakingRef, visemeWeightsRef]);

  return (
    <div
      ref={hostRef}
      className="avatar-canvas"
      role="img"
      aria-label="Avatar 3D animado de Aura"
    >
      <span className="avatar-loading">Cargando AURA…</span>
    </div>
  );
}
