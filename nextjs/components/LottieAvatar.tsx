'use client';

import dynamic from 'next/dynamic';

const LottiePlayerComponent = dynamic(() => import('./LottiePlayerInner'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center">
      <div className="text-8xl">🧑‍🏫</div>
    </div>
  ),
});

interface LottieAvatarProps {
  animationUrl?: string;
  isPlaying?: boolean;
  className?: string;
}

export default function LottieAvatar(props: LottieAvatarProps) {
  return <LottiePlayerComponent {...props} />;
}
