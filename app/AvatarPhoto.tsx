"use client";

import { useEffect, useRef, type MutableRefObject } from "react";

type AvatarPhotoProps = {
  audioLevelRef: MutableRefObject<number>;
  speakingRef: MutableRefObject<boolean>;
  alt: string;
};

export default function AvatarPhoto({
  audioLevelRef,
  speakingRef,
  alt,
}: AvatarPhotoProps) {
  const avatarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const avatar = avatarRef.current;
    if (!avatar) return;

    let frameId = 0;
    let openness = 0;
    let lastTime = performance.now();

    const animate = (time: number) => {
      frameId = requestAnimationFrame(animate);
      const elapsed = time / 1000;
      const delta = Math.min(0.05, (time - lastTime) / 1000);
      lastTime = time;

      const rawLevel = speakingRef.current
        ? Math.min(1, audioLevelRef.current * 11)
        : 0;
      const syllable = 0.72 + Math.sin(elapsed * 17.5) * 0.18;
      const target = rawLevel * syllable;
      const response = target > openness ? 22 : 13;
      openness += (target - openness) * Math.min(1, delta * response);

      avatar.style.setProperty("--mouth-open", openness.toFixed(3));
      avatar.style.setProperty(
        "--talk-tilt",
        speakingRef.current ? `${Math.sin(elapsed * 1.8) * 0.18}deg` : "0deg",
      );
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [audioLevelRef, speakingRef]);

  return (
    <div ref={avatarRef} className="photo-avatar">
      <div className="photo-avatar-portrait">
        <img className="photo-avatar-base" src="/aura-avatar.png" alt={alt} />
        <div className="mouth-cavity" aria-hidden="true" />
        <div className="mouth-layer mouth-upper" aria-hidden="true">
          <img src="/aura-avatar.png" alt="" />
        </div>
        <div className="mouth-layer mouth-lower" aria-hidden="true">
          <img src="/aura-avatar.png" alt="" />
        </div>
      </div>
      <span className="photo-shine" aria-hidden="true" />
    </div>
  );
}
