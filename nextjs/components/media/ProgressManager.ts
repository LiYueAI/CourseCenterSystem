'use client';

import { useCallback } from 'react';

const STORAGE_PREFIX = 'media_progress_';

export interface MediaProgress {
  position: number;
  completed: boolean;
  updatedAt: string;
}

export function useProgressManager(itemId: number, duration: number = 0) {
  const getProgress = useCallback((): MediaProgress | null => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem(`${STORAGE_PREFIX}${itemId}`);
    return stored ? JSON.parse(stored) : null;
  }, [itemId]);

  const saveProgress = useCallback((position: number, completed: boolean = false) => {
    if (typeof window === 'undefined') return;
    const progress: MediaProgress = {
      position,
      completed,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(`${STORAGE_PREFIX}${itemId}`, JSON.stringify(progress));
  }, [itemId]);

  const markCompleted = useCallback(() => {
    saveProgress(duration > 0 ? duration : 999999, true);
  }, [itemId, duration, saveProgress]);

  const clearProgress = useCallback(() => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(`${STORAGE_PREFIX}${itemId}`);
  }, [itemId]);

  const syncToServer = useCallback(async (lessonId: number) => {
    const progress = getProgress();
    if (!progress) return;

    try {
      await fetch('/api/student/progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lesson_id: lessonId,
          item_progress: { [itemId]: progress },
        }),
      });
    } catch (e) {
      console.error('Failed to sync progress', e);
    }
  }, [itemId, getProgress]);

  return { getProgress, saveProgress, markCompleted, clearProgress, syncToServer };
}
