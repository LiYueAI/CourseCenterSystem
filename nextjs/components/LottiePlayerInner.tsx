'use client';

import { useRef } from 'react';
import { Player } from '@lottiefiles/react-lottie-player';

interface LottieAvatarProps {
  animationUrl?: string;
  isPlaying?: boolean;
  className?: string;
}

export default function LottiePlayerInner({
  animationUrl,
  isPlaying = false,
  className = '',
}: LottieAvatarProps) {
  const playerRef = useRef<any>(null);

  if (!animationUrl) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div className="text-center">
          <div className="text-8xl mb-4">🧑‍🏫</div>
          <p className="text-white/60 text-sm">数字人</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <Player
        ref={playerRef}
        src={animationUrl}
        className="w-full h-full"
        style={{ width: '100%', height: '100%', maxWidth: 400, maxHeight: 400 }}
        loop
        autoplay={isPlaying}
      />
    </div>
  );
}
