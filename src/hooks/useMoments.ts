import { useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import * as momentsRepo from '../db/momentsRepo';
import type { Moment, AppendNote } from '../types';
import type { StreakState } from '../utils/streakEngine';

export function useMoments(limit = 50) {
  const [moments, setMoments] = useState<Moment[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await momentsRepo.getAllMoments(limit, 0);
      setMoments(data);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { moments, loading, refresh };
}

export function useMomentDetail(id: string | null) {
  const [moment, setMoment] = useState<Moment | null>(null);
  const [notes, setNotes] = useState<AppendNote[]>([]);

  const refresh = useCallback(async () => {
    if (!id) return;
    const m = await momentsRepo.getMomentById(id);
    setMoment(m);
    const n = await momentsRepo.getAppendNotes(id);
    setNotes(n);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { moment, notes, refresh };
}

export function useEmotionStats(startMs: number, endMs: number) {
  const [stats, setStats] = useState<Array<{ date: string; emotion: string | null; reason: string | null }>>([]);

  useEffect(() => {
    momentsRepo.getEmotionStats(startMs, endMs).then(setStats);
  }, [startMs, endMs]);

  return stats;
}

export function useStreak() {
  const [streak, setStreak] = useState<StreakState>({
    currentStreak: 0, longestStreak: 0, freezeCards: 0,
    lastActiveDate: '', rekindleDeadline: 0, streakBeforeBreak: 0,
  });

  const refresh = useCallback(async () => {
    const s = await momentsRepo.getStreakState();
    setStreak(s);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return streak;
}

export function useFavoriteMoments() {
  const [moments, setMoments] = useState<Moment[]>([]);

  const refresh = useCallback(async () => {
    const data = await momentsRepo.getFavoriteMoments(50);
    setMoments(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { moments, refresh };
}
