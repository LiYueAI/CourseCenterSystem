'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { useProgressManager } from './ProgressManager';

interface AudioPlayerProps {
  src: string;
  itemId: number;
  lessonId: number;
  title: string;
  duration?: number;
  onEnded?: () => void;
  autoPlay?: boolean;
  immersive?: boolean;
}

export default function AudioPlayer({
  src,
  itemId,
  lessonId,
  title,
  duration: propDuration,
  onEnded,
  autoPlay = false,
  immersive = false,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(propDuration || 0);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const { getProgress, saveProgress, markCompleted } = useProgressManager(itemId, duration);

  useEffect(() => {
    const saved = getProgress();
    if (saved && audioRef.current && !autoPlay) {
      audioRef.current.currentTime = saved.position;
    }
  }, [getProgress, autoPlay]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoaded(true);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => {
      setIsPlaying(false);
      saveProgress(audio.currentTime);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      markCompleted();
      onEnded?.();
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [saveProgress, markCompleted, onEnded]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isLoaded) return;

    if (autoPlay) {
      audio.play().catch((error) => {
        console.error('Failed to autoplay audio', error);
      });
      return;
    }

    audio.pause();
  }, [autoPlay, isLoaded]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
  }, [isPlaying]);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = time;
    }
  }, []);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    seek(percent * duration);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={`mx-auto rounded-xl backdrop-blur-sm ${
        immersive
          ? 'w-full max-w-3xl rounded-[28px] border border-[#e3cfab]/70 bg-[linear-gradient(180deg,rgba(255,251,245,0.98),rgba(247,238,221,0.92))] p-8 shadow-[0_24px_48px_rgba(192,157,92,0.18)] md:p-10'
          : 'max-w-lg bg-white/10 p-6'
      }`}
    >
      <p className={`mb-4 text-center font-medium ${immersive ? 'text-2xl text-[#6f4f25]' : 'text-xl text-white'}`}>
        {title}
      </p>

      <audio ref={audioRef} src={src} preload="metadata" />

      <div
        className="flex items-center gap-2 mb-4 cursor-pointer"
        onClick={handleProgressClick}
      >
        <span className={`w-12 text-xs ${immersive ? 'text-[#8a6a3b]' : 'text-white/60'}`}>{formatTime(currentTime)}</span>
        <div className={`flex-1 h-2 rounded-full ${immersive ? 'bg-[#dfc89d]/45' : 'bg-white/20'}`}>
          <div
            className="h-full bg-amber-400 rounded-full transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className={`w-12 text-xs ${immersive ? 'text-[#8a6a3b]' : 'text-white/60'}`}>{formatTime(duration)}</span>
      </div>

      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => seek(Math.max(0, currentTime - 10))}
          className={`p-2 transition-colors ${immersive ? 'text-[#9b7442] hover:text-[#6f4f25]' : 'text-white/60 hover:text-white'}`}
          title="后退10秒"
        >
          <SkipBack className="w-5 h-5" />
        </button>

        <button
          onClick={togglePlay}
          className="p-4 bg-amber-500 hover:bg-amber-400 rounded-full transition-colors shadow-lg"
        >
          {isPlaying ? (
            <Pause className="w-6 h-6 text-white" />
          ) : (
            <Play className="w-6 h-6 text-white ml-0.5" />
          )}
        </button>

        <button
          onClick={() => seek(Math.min(duration, currentTime + 10))}
          className={`p-2 transition-colors ${immersive ? 'text-[#9b7442] hover:text-[#6f4f25]' : 'text-white/60 hover:text-white'}`}
          title="快进10秒"
        >
          <SkipForward className="w-5 h-5" />
        </button>
      </div>

      <div className="flex justify-center mt-4">
        <button
          onClick={() => {
            const audio = audioRef.current;
            if (audio) {
              audio.muted = !isMuted;
              setIsMuted(audio.muted);
            }
          }}
          className={`p-2 transition-colors ${immersive ? 'text-[#9b7442] hover:text-[#6f4f25]' : 'text-white/60 hover:text-white'}`}
          title={isMuted ? '取消静音' : '静音'}
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>

      {!isLoaded && (
        <div className="flex justify-center mt-4">
          <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
