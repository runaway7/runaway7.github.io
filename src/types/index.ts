export interface Moment {
  id: string;
  photoUri: string;
  caption: string;
  emotion: EmotionKey | null;
  emotionReason: string | null;
  isFavorite: boolean;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface AppendNote {
  id: string;
  momentId: string;
  text: string;
  createdAt: number;
}

export type EmotionKey = 'happy' | 'sad' | 'angry' | 'anxious' | 'calm' | 'excited' | 'tired' | 'grateful';

export interface EmotionDef {
  key: EmotionKey;
  emoji: string;
  label: string;
  valence: 'positive' | 'negative' | 'neutral';
  color: string;
}

export const EMOTIONS: EmotionDef[] = [
  { key: 'happy',       emoji: '😊', label: '开心',   valence: 'positive', color: '#F2A65A' },
  { key: 'excited',     emoji: '🎉', label: '兴奋',   valence: 'positive', color: '#E8815F' },
  { key: 'grateful',    emoji: '🙏', label: '感恩',   valence: 'positive', color: '#7EC8A7' },
  { key: 'calm',        emoji: '😌', label: '平静',   valence: 'neutral',  color: '#8FBCBB' },
  { key: 'sad',         emoji: '😢', label: '难过',   valence: 'negative', color: '#7B9EC7' },
  { key: 'angry',       emoji: '😡', label: '生气',   valence: 'negative', color: '#D97C6E' },
  { key: 'anxious',     emoji: '😰', label: '焦虑',   valence: 'negative', color: '#C4A3CF' },
  { key: 'tired',       emoji: '😴', label: '疲惫',   valence: 'negative', color: '#9B8E86' },
];

export function getEmotionDef(key: EmotionKey | null): EmotionDef | null {
  if (!key) return null;
  return EMOTIONS.find(e => e.key === key) ?? null;
}

export const PRESET_TAGS = ['旅行', '美食', '工作', '家人', '朋友', '运动', '阅读', '电影', '音乐', '日常', '学习', '自然'];
