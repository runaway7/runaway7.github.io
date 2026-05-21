import { useState, useMemo, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Image, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, Radius, FontSize } from '../../src/constants/theme';
import { useMoments, useFavoriteMoments } from '../../src/hooks/useMoments';
import { getAllTags } from '../../src/db/momentsRepo';
import { getEmotionDef } from '../../src/types';
import type { Moment } from '../../src/types';

const { width: screenW } = Dimensions.get('window');

type ViewMode = 'day' | 'week' | 'month' | 'year';

function groupByDay(moments: Moment[]): Map<string, Moment[]> {
  const map = new Map<string, Moment[]>();
  for (const m of moments) {
    const day = new Date(m.createdAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(m);
  }
  return map;
}

function groupByMonth(moments: Moment[]): Map<string, Moment[]> {
  const map = new Map<string, Moment[]>();
  for (const m of moments) {
    const key = new Date(m.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return map;
}

function getDateRange(view: ViewMode): [number, number] {
  const now = new Date();
  switch (view) {
    case 'day': { const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); return [start, start + 86400000]; }
    case 'week': { const dayOfWeek = now.getDay() || 7; const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek + 1).getTime(); return [start, Date.now()]; }
    case 'month': { const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime(); return [start, Date.now()]; }
    case 'year': { const start = new Date(now.getFullYear(), 0, 1).getTime(); return [start, Date.now()]; }
  }
}

const QUOTE = '完美，只要发生，不需要向谁证明，只要自己记得。';

export default function ReviewScreen() {
  const router = useRouter();
  const { moments } = useMoments(200);
  const { moments: favMoments } = useFavoriteMoments();
  const [view, setView] = useState<ViewMode>('day');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);

  const [rangeStart] = getDateRange(view);

  const filteredMoments = useMemo(() => {
    let list = showFavoritesOnly ? favMoments : moments;
    if (view !== 'day') list = list.filter(m => m.createdAt >= rangeStart);
    if (filterTag) list = list.filter(m => m.tags.includes(filterTag));
    return list;
  }, [moments, favMoments, showFavoritesOnly, view, rangeStart, filterTag]);

  const dayGroups = useMemo(() => groupByDay(filteredMoments), [filteredMoments]);
  const monthGroups = useMemo(() => groupByMonth(filteredMoments), [filteredMoments]);

  const topEmotion = useMemo(() => {
    const count: Record<string, number> = {};
    for (const m of filteredMoments) { if (m.emotion) count[m.emotion] = (count[m.emotion] || 0) + 1; }
    let top: string | null = null; let topCount = 0;
    for (const [e, c] of Object.entries(count)) { if (c > topCount) { topCount = c; top = e; } }
    return top;
  }, [filteredMoments]);

  const loadTags = useCallback(() => { getAllTags().then(setAllTags); }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.quote}>{QUOTE}</Text>

        <View style={styles.tabRow}>
          {(['day', 'week', 'month', 'year'] as ViewMode[]).map(v => (
            <TouchableOpacity key={v} style={[styles.tabBtn, view === v && styles.tabBtnActive]} onPress={() => setView(v)}>
              <Text style={[styles.tabBtnText, view === v && styles.tabBtnTextActive]}>
                {v === 'day' ? '📅 今天' : v === 'week' ? '📊 本周' : v === 'month' ? '📈 本月' : '🎬 年度'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.filterRow}>
        <TouchableOpacity style={[styles.filterChip, showFavoritesOnly && styles.filterChipActive]} onPress={() => { setShowFavoritesOnly(!showFavoritesOnly); setFilterTag(null); }}>
          <Text style={[styles.filterChipText, showFavoritesOnly && styles.filterChipTextActive]}>⭐ 精选</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterChip} onPress={() => { loadTags(); router.push('/search'); }}>
          <Text style={styles.filterChipText}>🔍 搜索</Text>
        </TouchableOpacity>
        {allTags.map(tag => (
          <TouchableOpacity key={tag} style={[styles.filterChip, filterTag === tag && styles.filterChipActive]} onPress={() => setFilterTag(filterTag === tag ? null : tag)}>
            <Text style={[styles.filterChipText, filterTag === tag && styles.filterChipTextActive]}>{tag}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {filteredMoments.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📸</Text>
            <Text style={styles.emptyTitle}>这里还没有记录</Text>
            <Text style={styles.emptyDesc}>去 Now 拍下你的第一个瞬间，{'\n'}回头看的时候会发现「原来我做了这么多」</Text>
          </View>
        ) : (
          <>
            {view === 'day' && [...dayGroups.entries()].map(([day, items]) => (
              <View key={day}>
                <Text style={styles.dayHeader}>{day}</Text>
                {items.map(m => {
                  const emoDef = getEmotionDef(m.emotion);
                  return (
                    <TouchableOpacity key={m.id} style={styles.momentCard} onPress={() => router.push(`/detail/${m.id}`)} activeOpacity={0.8}>
                      <Image source={{ uri: m.photoUri }} style={styles.cardImage} />
                      <View style={styles.cardMeta}>
                        {m.caption ? <Text style={styles.cardCaption} numberOfLines={5}>{m.caption}</Text> : null}
                        <View style={styles.cardFooter}>
                          <Text style={styles.cardTime}>{new Date(m.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</Text>
                          <View style={styles.cardFooterRight}>
                            {m.isFavorite && <Text style={styles.favStar}>⭐</Text>}
                            {emoDef && <Text style={styles.cardEmotion}>{emoDef.emoji}</Text>}
                          </View>
                        </View>
                        {m.tags.length > 0 && (
                          <View style={styles.cardTags}>{m.tags.map(t => <View key={t} style={styles.cardTag}><Text style={styles.cardTagText}>{t}</Text></View>)}</View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}

            {(view === 'week' || view === 'month') && (
              <View>
                {topEmotion && (
                  <View style={styles.emotionBar}>
                    <Text style={styles.emotionBarTitle}>最主要情绪</Text>
                    <Text style={styles.emotionBarMain}>{getEmotionDef(topEmotion as any)?.emoji} {getEmotionDef(topEmotion as any)?.label}</Text>
                    <Text style={styles.emotionBarSub}>{filteredMoments.length} 个瞬间</Text>
                  </View>
                )}
                <View style={styles.grid}>
                  {filteredMoments.slice(0, 30).map(m => (
                    <TouchableOpacity key={m.id} style={styles.gridItem} onPress={() => router.push(`/detail/${m.id}`)} activeOpacity={0.8}>
                      <Image source={{ uri: m.photoUri }} style={styles.gridImage} />
                      {m.isFavorite && <Text style={styles.gridFav}>⭐</Text>}
                      {m.emotion && <Text style={styles.gridEmotion}>{getEmotionDef(m.emotion)?.emoji}</Text>}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {view === 'year' && [...monthGroups.entries()].map(([month, items]) => (
              <View key={month} style={styles.monthBlock}>
                <Text style={styles.monthTitle}>{month} · {items.length} 张</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {items.slice(0, 10).map(m => (
                    <TouchableOpacity key={m.id} onPress={() => router.push(`/detail/${m.id}`)} activeOpacity={0.8}>
                      <Image source={{ uri: m.photoUri }} style={styles.hScrollImg} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingTop: 60, paddingHorizontal: Spacing.lg, backgroundColor: Colors.bg },
  quote: {
    fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 24,
    textAlign: 'center', paddingVertical: Spacing.md, fontStyle: 'italic',
  },
  tabRow: { flexDirection: 'row', gap: Spacing.sm, paddingBottom: Spacing.sm },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: Radius.lg, backgroundColor: Colors.secondary, alignItems: 'center' },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabBtnText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600' },
  tabBtnTextActive: { color: Colors.white },
  filterRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm, gap: Spacing.sm, flexWrap: 'wrap' },
  filterChip: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.secondary },
  filterChipActive: { backgroundColor: Colors.accent },
  filterChipText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600' },
  filterChipTextActive: { color: Colors.white },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },
  dayHeader: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600', marginTop: Spacing.lg, marginBottom: Spacing.sm },
  momentCard: {
    backgroundColor: Colors.white, borderRadius: Radius.xl, marginBottom: Spacing.md, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  cardImage: { width: '100%', aspectRatio: 4 / 3, backgroundColor: Colors.dark },
  cardMeta: { padding: Spacing.md },
  cardCaption: { fontSize: FontSize.sm, color: Colors.text, lineHeight: 20 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.xs },
  cardFooterRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  favStar: { fontSize: 14 },
  cardTime: { fontSize: FontSize.xs, color: Colors.textSecondary },
  cardEmotion: { fontSize: 20 },
  cardTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: Spacing.sm },
  cardTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full, backgroundColor: Colors.secondary },
  cardTagText: { fontSize: 10, color: Colors.textSecondary },
  emotionBar: {
    backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing.lg,
    marginBottom: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
  },
  emotionBarTitle: { fontSize: FontSize.xs, color: Colors.textSecondary },
  emotionBarMain: { fontSize: 24, fontWeight: '700', color: Colors.text },
  emotionBarSub: { fontSize: FontSize.sm, color: Colors.textSecondary, marginLeft: 'auto' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  gridItem: {
    width: (screenW - Spacing.lg * 2 - 8) / 3, aspectRatio: 1,
    borderRadius: Radius.md, overflow: 'hidden', position: 'relative',
  },
  gridImage: { width: '100%', height: '100%', backgroundColor: Colors.dark },
  gridFav: { position: 'absolute', top: 4, left: 4, fontSize: 12 },
  gridEmotion: { position: 'absolute', bottom: 4, right: 4, fontSize: 14 },
  monthBlock: { marginBottom: Spacing.xl },
  monthTitle: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600', marginBottom: Spacing.sm },
  hScrollImg: { width: 100, height: 100, borderRadius: Radius.md, marginRight: Spacing.sm, backgroundColor: Colors.dark },
  empty: { paddingTop: 80, alignItems: 'center', gap: Spacing.md },
  emptyEmoji: { fontSize: 64 },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: '600', color: Colors.text },
  emptyDesc: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
});
