/**
 * 火花规则引擎
 *
 * 等级体系:
 *   🔥 火花 (1-6天)    — 无特权
 *   ✨ 星火 (7-13天)   — 每7天获得1张冻结卡
 *   💎 钻火 (14-29天)  — 每7天获得2张冻结卡
 *   👑 王火 (30+天)    — 每7天获得3张冻结卡，复活无需条件
 *
 * 冻结卡:
 *   - 最多持有 3 张
 *   - 断火时自动消耗 1 张保护连续
 *
 * 复活窗口:
 *   - 断火后24小时内为复活期
 *   - 复活条件: 记录2个moment
 *   - 复活后恢复到断前连续天数的50%
 *   - 王火级别直接复活，恢复100%
 */

export type StreakLevel = 'spark' | 'star' | 'diamond' | 'crown';

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  freezeCards: number;
  lastActiveDate: string;      // YYYY-MM-DD
  rekindleDeadline: number;    // timestamp, 0 means no active rekindle
  streakBeforeBreak: number;   // streak value before break, for rekindle
}

export function getStreakLevel(streak: number): StreakLevel {
  if (streak >= 30) return 'crown';
  if (streak >= 14) return 'diamond';
  if (streak >= 7) return 'star';
  return 'spark';
}

export function getStreakEmoji(level: StreakLevel): string {
  switch (level) {
    case 'crown': return '👑';
    case 'diamond': return '💎';
    case 'star': return '✨';
    default: return '🔥';
  }
}

export function getStreakLabel(level: StreakLevel): string {
  switch (level) {
    case 'crown': return '王火';
    case 'diamond': return '钻火';
    case 'star': return '星火';
    default: return '火花';
  }
}

export function getFreezeCardsPerWeek(level: StreakLevel): number {
  switch (level) {
    case 'crown': return 3;
    case 'diamond': return 2;
    case 'star': return 1;
    default: return 0;
  }
}

export function getRekindleRecoveryRate(level: StreakLevel): number {
  // What percentage of streak is recovered after rekindle
  switch (level) {
    case 'crown': return 1.0;   // 100%
    case 'diamond': return 0.7; // 70%
    case 'star': return 0.5;    // 50%
    default: return 0.3;        // 30%
  }
}

const MAX_FREEZE_CARDS = 3;
const REKINDLE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const REKINDLE_REQUIRED_MOMENTS = 2;

export function computeStreakAfterRecord(state: StreakState, today: string): {
  newState: StreakState;
  levelChanged: boolean;
  oldLevel: StreakLevel;
  newLevel: StreakLevel;
  freezeCardEarned: boolean;
  rekindled: boolean;
} {
  const oldLevel = getStreakLevel(state.currentStreak);
  let { currentStreak, longestStreak, freezeCards, lastActiveDate, rekindleDeadline, streakBeforeBreak } = state;
  let levelChanged = false;
  let freezeCardEarned = false;
  let rekindled = false;

  // Check if this is a rekindle
  if (rekindleDeadline > 0 && Date.now() <= rekindleDeadline) {
    // Within rekindle window
    // The caller should check if 2 moments were recorded, but we just handle state here
    rekindled = true;
    const oldLevelForRecovery = getStreakLevel(streakBeforeBreak);
    const recoveryRate = getRekindleRecoveryRate(oldLevelForRecovery);
    currentStreak = Math.max(1, Math.floor(streakBeforeBreak * recoveryRate));
    rekindleDeadline = 0;
    streakBeforeBreak = 0;
  } else if (lastActiveDate) {
    const lastDate = new Date(lastActiveDate);
    const todayDate = new Date(today);
    const diffDays = Math.floor((todayDate.getTime() - lastDate.getTime()) / 86400000);

    if (diffDays === 0) {
      // Same day, no streak change
    } else if (diffDays === 1) {
      // Consecutive day
      currentStreak += 1;
    } else {
      // Gap > 1 day — streak broken or protected by freeze card
      if (freezeCards > 0) {
        freezeCards -= 1;
        currentStreak += 1; // Protected!
      } else {
        // Start rekindle window
        rekindleDeadline = Date.now() + REKINDLE_WINDOW_MS;
        streakBeforeBreak = currentStreak;
        currentStreak = 0;
      }
    }
  } else {
    // First record ever or after long absence with no rekindle
    if (rekindleDeadline === 0) {
      currentStreak = 1;
    }
  }

  if (currentStreak > longestStreak) {
    longestStreak = currentStreak;
  }

  // Check if earned freeze card (every 7 days of streak)
  const newLevel = getStreakLevel(currentStreak);
  if (newLevel !== oldLevel) {
    levelChanged = true;
    // Award freeze cards on level-up
    const cardsForNewLevel = getFreezeCardsPerWeek(newLevel);
    if (cardsForNewLevel > 0 && freezeCards < MAX_FREEZE_CARDS) {
      freezeCards = Math.min(MAX_FREEZE_CARDS, freezeCards + 1);
      freezeCardEarned = true;
    }
  }

  // Also award freeze cards every 7 days within same level
  if (currentStreak > 0 && currentStreak % 7 === 0 && currentStreak >= 7) {
    const cardsPerWeek = getFreezeCardsPerWeek(newLevel);
    if (freezeCards < MAX_FREEZE_CARDS) {
      freezeCards = Math.min(MAX_FREEZE_CARDS, freezeCards + cardsPerWeek);
      if (cardsPerWeek > 0 && freezeCards < MAX_FREEZE_CARDS + 1) {
        freezeCardEarned = true;
      }
    }
  }

  return {
    newState: {
      currentStreak,
      longestStreak,
      freezeCards,
      lastActiveDate: today,
      rekindleDeadline,
      streakBeforeBreak,
    },
    levelChanged,
    oldLevel,
    newLevel,
    freezeCardEarned,
    rekindled,
  };
}

export function canRekindle(state: StreakState): boolean {
  return state.rekindleDeadline > 0 && Date.now() <= state.rekindleDeadline;
}

export function getRekindleHoursLeft(state: StreakState): number {
  if (state.rekindleDeadline <= 0) return 0;
  return Math.max(0, Math.ceil((state.rekindleDeadline - Date.now()) / (60 * 60 * 1000)));
}
