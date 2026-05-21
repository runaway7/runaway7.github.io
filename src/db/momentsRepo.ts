import { getDatabase } from './database';
import type { Moment, AppendNote, EmotionKey } from '../types';

function generateId(prefix = 'm'): string {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rowToMoment(db: any, row: {
  id: string; photo_uri: string; caption: string; emotion: string | null;
  emotion_reason: string; is_favorite: number; created_at: number; updated_at: number;
}): Promise<Moment> {
  const tagRows = await db.getAllAsync(
    'SELECT t.name FROM tags t INNER JOIN moment_tags mt ON t.id = mt.tag_id WHERE mt.moment_id = ?',
    [row.id],
  ) as Array<{ name: string }>;
  return {
    id: row.id,
    photoUri: row.photo_uri,
    caption: row.caption,
    emotion: row.emotion as EmotionKey | null,
    emotionReason: row.emotion_reason || null,
    isFavorite: row.is_favorite === 1,
    tags: tagRows.map((t: { name: string }) => t.name),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type MomentRow = {
  id: string; photo_uri: string; caption: string; emotion: string | null;
  emotion_reason: string; is_favorite: number; created_at: number; updated_at: number;
};

// ── Moment CRUD ──

export async function createMoment(
  photoUri: string,
  caption: string = '',
  emotion: EmotionKey | null = null,
  emotionReason: string = '',
  tags: string[] = [],
): Promise<Moment> {
  const db = await getDatabase();
  const id = generateId('m');
  const now = Date.now();

  await db.runAsync(
    `INSERT INTO moments (id, photo_uri, caption, emotion, emotion_reason, is_favorite, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    [id, photoUri, caption, emotion, emotionReason, now, now],
  );

  for (const tagName of tags) {
    await db.runAsync('INSERT OR IGNORE INTO tags (name) VALUES (?)', [tagName]);
    const tagRow = await db.getFirstAsync<{ id: number }>('SELECT id FROM tags WHERE name = ?', [tagName]);
    if (tagRow) {
      await db.runAsync('INSERT OR IGNORE INTO moment_tags (moment_id, tag_id) VALUES (?, ?)', [id, tagRow.id]);
    }
  }

  // Update streak
  try { await recordMomentForStreak(); } catch {}

  return { id, photoUri, caption, emotion, emotionReason, isFavorite: false, tags, createdAt: now, updatedAt: now };
}

export async function getAllMoments(limit = 50, offset = 0): Promise<Moment[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<MomentRow>(
    'SELECT * FROM moments ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset],
  );
  const result: Moment[] = [];
  for (const r of rows) result.push(await rowToMoment(db, r));
  return result;
}

export async function getMomentById(id: string): Promise<Moment | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<MomentRow>('SELECT * FROM moments WHERE id = ?', [id]);
  if (!row) return null;
  return rowToMoment(db, row);
}

export async function updateCaption(id: string, caption: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE moments SET caption = ?, updated_at = ? WHERE id = ?', [caption, Date.now(), id]);
}

export async function updateEmotion(id: string, emotion: EmotionKey | null, emotionReason?: string): Promise<void> {
  const db = await getDatabase();
  if (emotionReason !== undefined) {
    await db.runAsync('UPDATE moments SET emotion = ?, emotion_reason = ?, updated_at = ? WHERE id = ?', [emotion, emotionReason, Date.now(), id]);
  } else {
    await db.runAsync('UPDATE moments SET emotion = ?, updated_at = ? WHERE id = ?', [emotion, Date.now(), id]);
  }
}

export async function toggleFavorite(id: string): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ is_favorite: number }>('SELECT is_favorite FROM moments WHERE id = ?', [id]);
  if (!row) return false;
  const next = row.is_favorite ? 0 : 1;
  await db.runAsync('UPDATE moments SET is_favorite = ? WHERE id = ?', [next, id]);
  return next === 1;
}

export async function updateTags(id: string, tags: string[]): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM moment_tags WHERE moment_id = ?', [id]);
  for (const tagName of tags) {
    await db.runAsync('INSERT OR IGNORE INTO tags (name) VALUES (?)', [tagName]);
    const tagRow = await db.getFirstAsync<{ id: number }>('SELECT id FROM tags WHERE name = ?', [tagName]);
    if (tagRow) {
      await db.runAsync('INSERT OR IGNORE INTO moment_tags (moment_id, tag_id) VALUES (?, ?)', [id, tagRow.id]);
    }
  }
}

export async function deleteMoment(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM moment_tags WHERE moment_id = ?', [id]);
  await db.runAsync('DELETE FROM append_notes WHERE moment_id = ?', [id]);
  await db.runAsync('DELETE FROM moments WHERE id = ?', [id]);
}

// ── Favorites ──

export async function getFavoriteMoments(limit = 50): Promise<Moment[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<MomentRow>(
    'SELECT * FROM moments WHERE is_favorite = 1 ORDER BY created_at DESC LIMIT ?', [limit],
  );
  const result: Moment[] = [];
  for (const r of rows) result.push(await rowToMoment(db, r));
  return result;
}

// ── Tags ──

export async function getAllTags(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ name: string }>('SELECT name FROM tags ORDER BY name');
  return rows.map(r => r.name);
}

export async function getMomentsByTag(tagName: string, limit = 50): Promise<Moment[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<MomentRow>(
    `SELECT m.* FROM moments m
     INNER JOIN moment_tags mt ON m.id = mt.moment_id
     INNER JOIN tags t ON mt.tag_id = t.id
     WHERE t.name = ? ORDER BY m.created_at DESC LIMIT ?`,
    [tagName, limit],
  );
  const result: Moment[] = [];
  for (const r of rows) result.push(await rowToMoment(db, r));
  return result;
}

// ── Search ──

export async function searchMoments(query: string, limit = 50): Promise<Moment[]> {
  const db = await getDatabase();
  const like = `%${query}%`;
  const rows = await db.getAllAsync<MomentRow>(
    'SELECT * FROM moments WHERE caption LIKE ? OR emotion_reason LIKE ? ORDER BY created_at DESC LIMIT ?',
    [like, like, limit],
  );
  const result: Moment[] = [];
  for (const r of rows) result.push(await rowToMoment(db, r));
  return result;
}

// ── Date range ──

export async function getMomentsByDateRange(startMs: number, endMs: number): Promise<Moment[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<MomentRow>(
    'SELECT * FROM moments WHERE created_at >= ? AND created_at <= ? ORDER BY created_at DESC',
    [startMs, endMs],
  );
  const result: Moment[] = [];
  for (const r of rows) result.push(await rowToMoment(db, r));
  return result;
}

export async function getMomentCount(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM moments');
  return row?.count ?? 0;
}

// ── Streak ──

import type { StreakState } from '../utils/streakEngine';
import { computeStreakAfterRecord } from '../utils/streakEngine';

export async function getStreakState(): Promise<StreakState> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{
    current_streak: number; longest_streak: number; freeze_cards: number;
    last_active_date: string; rekindle_deadline: number; streak_before_break: number;
  }>('SELECT * FROM streak_state WHERE id = 1');
  if (!row) {
    return { currentStreak: 0, longestStreak: 0, freezeCards: 0, lastActiveDate: '', rekindleDeadline: 0, streakBeforeBreak: 0 };
  }
  return {
    currentStreak: row.current_streak,
    longestStreak: row.longest_streak,
    freezeCards: row.freeze_cards,
    lastActiveDate: row.last_active_date,
    rekindleDeadline: row.rekindle_deadline,
    streakBeforeBreak: row.streak_before_break,
  };
}

export async function getStreakInfo(): Promise<{ currentStreak: number; longestStreak: number; freezeCards: number }> {
  const state = await getStreakState();
  return { currentStreak: state.currentStreak, longestStreak: state.longestStreak, freezeCards: state.freezeCards };
}

export async function recordMomentForStreak(): Promise<{
  state: StreakState;
  levelChanged: boolean;
  oldLevel: string;
  newLevel: string;
  freezeCardEarned: boolean;
  rekindled: boolean;
}> {
  const state = await getStreakState();
  const today = new Date().toISOString().slice(0, 10);

  const result = computeStreakAfterRecord(state, today);
  const ns = result.newState;

  const db = await getDatabase();
  await db.runAsync(
    `UPDATE streak_state SET
      current_streak = ?, longest_streak = ?, freeze_cards = ?,
      last_active_date = ?, rekindle_deadline = ?, streak_before_break = ?, updated_at = ?
     WHERE id = 1`,
    [ns.currentStreak, ns.longestStreak, ns.freezeCards,
     ns.lastActiveDate, ns.rekindleDeadline, ns.streakBeforeBreak, Date.now()],
  );

  return {
    state: ns,
    levelChanged: result.levelChanged,
    oldLevel: result.oldLevel,
    newLevel: result.newLevel,
    freezeCardEarned: result.freezeCardEarned,
    rekindled: result.rekindled,
  };
}

export async function checkRekindleReady(): Promise<boolean> {
  const state = await getStreakState();
  if (state.rekindleDeadline <= 0 || Date.now() > state.rekindleDeadline) return false;
  // Check if 2 or more moments were recorded since the break
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM moments WHERE created_at > ?',
    [state.rekindleDeadline - 24 * 60 * 60 * 1000],
  );
  return (row?.count ?? 0) >= 2;
}

// ── Emotion stats ──

export async function getEmotionStats(startMs: number, endMs: number): Promise<Array<{ date: string; emotion: string | null; reason: string | null }>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ created_at: number; emotion: string | null; emotion_reason: string | null }>(
    'SELECT created_at, emotion, emotion_reason FROM moments WHERE created_at >= ? AND created_at <= ? AND emotion IS NOT NULL ORDER BY created_at ASC',
    [startMs, endMs],
  );
  return rows.map(r => ({
    date: new Date(r.created_at).toISOString().slice(0, 10),
    emotion: r.emotion,
    reason: r.emotion_reason,
  }));
}

// ── Append Notes ──

export async function addAppendNote(momentId: string, text: string): Promise<AppendNote> {
  const db = await getDatabase();
  const id = generateId('an');
  const now = Date.now();
  await db.runAsync(
    'INSERT INTO append_notes (id, moment_id, text, created_at) VALUES (?, ?, ?, ?)',
    [id, momentId, text, now],
  );
  return { id, momentId, text, createdAt: now };
}

export async function getAppendNotes(momentId: string): Promise<AppendNote[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: string; moment_id: string; text: string; created_at: number }>(
    'SELECT * FROM append_notes WHERE moment_id = ? ORDER BY created_at ASC', [momentId],
  );
  return rows.map(r => ({ id: r.id, momentId: r.moment_id, text: r.text, createdAt: r.created_at }));
}

// ── "On this day" ──

export async function getMomentsForDayOffset(dayOffset: number): Promise<Moment[]> {
  const db = await getDatabase();
  const target = new Date();
  target.setDate(target.getDate() - dayOffset);
  const start = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const end = start + 86400000;

  const rows = await db.getAllAsync<MomentRow>(
    'SELECT * FROM moments WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC',
    [start, end],
  );
  const result: Moment[] = [];
  for (const r of rows) result.push(await rowToMoment(db, r));
  return result;
}
