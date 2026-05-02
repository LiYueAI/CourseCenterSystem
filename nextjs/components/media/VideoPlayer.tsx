'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize2,
  Settings,
} from 'lucide-react';
import { useProgressManager } from './ProgressManager';

interface VideoPlayerProps {
  src: string;
  itemId: number;
  lessonId: number;
  title: string;
  onEnded?: () => void;
  autoPlay?: boolean;
  immersive?: boolean;
}

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function VideoPlayer({
  src,
  itemId,
  lessonId,
  title,
  onEnded,
  autoPlay = false,
  immersive = false,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const { getProgress, saveProgress, markCompleted } = useProgressManager(itemId, duration);

  useEffect(() => {
    const saved = getProgress();
    if (saved && videoRef.current && !autoPlay) {
      videoRef.current.currentTime = saved.position;
    }
  }, [getProgress, autoPlay]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setIsLoaded(true);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => {
      setIsPlaying(false);
      saveProgress(video.currentTime);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      markCompleted();
      onEnded?.();
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [saveProgress, markCompleted, onEnded]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isLoaded) return;

    if (autoPlay) {
      video.play().catch((error) => {
        console.error('Failed to autoplay video', error);
      });
      return;
    }

    video.pause();
  }, [autoPlay, isLoaded]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;

      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          isPlaying ? video.pause() : video.play();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          video.currentTime = Math.max(0, video.currentTime - 10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          video.currentTime = Math.min(duration, video.currentTime + 10);
          break;
        case 'm':
        case 'M':
          video.muted = !video.muted;
          setIsMuted(video.muted);
          break;
        case 'f':
        case 'F':
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            video.parentElement?.requestFullscreen();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, duration]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
  }, [isPlaying]);

  const seek = useCallback((time: number) => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = time;
    }
  }, []);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    seek(percent * duration);
  };

  const changePlaybackRate = (rate: number) => {
    const video = videoRef.current;
    if (video) {
      video.playbackRate = rate;
      setPlaybackRate(rate);
    }
    setShowSettings(false);
  };

  const toggleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      video.parentElement?.requestFullscreen();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={`relative overflow-hidden group ${
        immersive
          ? 'h-full w-full rounded-[26px] border border-[#e6d4b4]/60 bg-[linear-gradient(180deg,rgba(255,251,245,0.98),rgba(248,239,221,0.92))] shadow-[0_18px_40px_rgba(192,157,92,0.18)]'
          : 'bg-black rounded-xl'
      }`}
    >
      <video
        ref={videoRef}
        src={src}
        className={
          immersive
            ? 'h-full w-full object-contain bg-[radial-gradient(circle_at_top,rgba(255,250,240,0.98),rgba(245,233,206,0.9))]'
            : 'mx-auto w-full max-h-[55vh]'
        }
        onClick={togglePlay}
        playsInline
      />

      {!immersive ? (
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/60 to-transparent p-4">
          <p className="text-white font-medium">{title}</p>
        </div>
      ) : null}

      <div
        className={`absolute bottom-0 left-0 right-0 p-4 opacity-0 transition-opacity group-hover:opacity-100 ${
          immersive
            ? 'bg-gradient-to-t from-[#fff7eb]/95 via-[#fff9f1]/86 to-transparent'
            : 'bg-gradient-to-t from-black/80 to-transparent'
        }`}
      >
        <div
          className="flex items-center gap-2 mb-3 cursor-pointer"
          onClick={handleProgressClick}
        >
          <span className={`text-xs w-12 ${immersive ? 'text-[#7d5f33]' : 'text-white'}`}>
            {formatTime(currentTime)}
          </span>
          <div className={`flex-1 h-1.5 rounded-full ${immersive ? 'bg-[#d9c29b]/40' : 'bg-white/30'}`}>
            <div
              className="h-full bg-amber-400 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className={`text-xs w-12 ${immersive ? 'text-[#7d5f33]' : 'text-white'}`}>
            {formatTime(duration)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              onClick={() => seek(Math.max(0, currentTime - 10))}
              className={`p-2 transition-colors ${
                immersive ? 'text-[#9b7442] hover:text-[#6f4f25]' : 'text-white/80 hover:text-white'
              }`}
              title="后退10秒"
            >
              <SkipBack className="w-5 h-5" />
            </button>

            <button
              onClick={togglePlay}
              className={`p-3 rounded-full transition-colors ${
                immersive
                  ? 'bg-[#fff5e1] hover:bg-[#fcecc8] shadow-[0_10px_24px_rgba(201,160,79,0.22)]'
                  : 'bg-white/20 hover:bg-white/30'
              }`}
            >
              {isPlaying ? (
                <Pause className={`w-6 h-6 ${immersive ? 'text-[#9a6a1f]' : 'text-white'}`} />
              ) : (
                <Play className={`w-6 h-6 ml-0.5 ${immersive ? 'text-[#9a6a1f]' : 'text-white'}`} />
              )}
            </button>

            <button
              onClick={() => seek(Math.min(duration, currentTime + 10))}
              className={`p-2 transition-colors ${
                immersive ? 'text-[#9b7442] hover:text-[#6f4f25]' : 'text-white/80 hover:text-white'
              }`}
              title="快进10秒"
            >
              <SkipForward className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                const video = videoRef.current;
                if (video) {
                  video.muted = !isMuted;
                  setIsMuted(video.muted);
                }
              }}
              className={`p-2 transition-colors ${
                immersive ? 'text-[#9b7442] hover:text-[#6f4f25]' : 'text-white/80 hover:text-white'
              }`}
              title="静音"
            >
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>

            <div className="relative">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-2 transition-colors ${
                  immersive ? 'text-[#9b7442] hover:text-[#6f4f25]' : 'text-white/80 hover:text-white'
                }`}
                title="播放速度"
              >
                <Settings className="w-5 h-5" />
              </button>
              {showSettings && (
                <div
                  className={`absolute bottom-full right-0 mb-2 rounded-lg p-2 shadow-xl ${
                    immersive
                      ? 'border border-[#ecd8af] bg-[#fffaf0]/95 backdrop-blur-sm'
                      : 'bg-gray-900'
                  }`}
                >
                  {PLAYBACK_RATES.map((rate) => (
                    <button
                      key={rate}
                      onClick={() => changePlaybackRate(rate)}
                      className={`block w-full text-left px-3 py-1.5 text-sm rounded transition-colors ${
                        immersive
                          ? playbackRate === rate
                            ? 'bg-[#fdf0cf] text-[#9a6a1f]'
                            : 'text-[#7d5f33] hover:bg-[#fff3dc] hover:text-[#9a6a1f]'
                          : playbackRate === rate
                            ? 'text-amber-400'
                            : 'text-white hover:text-amber-400'
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={toggleFullscreen}
              className={`p-2 transition-colors ${
                immersive ? 'text-[#9b7442] hover:text-[#6f4f25]' : 'text-white/80 hover:text-white'
              }`}
              title="全屏"
            >
              <Maximize2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {!isLoaded && (
        <div
          className={`absolute inset-0 flex items-center justify-center ${
            immersive ? 'bg-[#fff8ef]/72 backdrop-blur-[1px]' : 'bg-black/50'
          }`}
        >
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
