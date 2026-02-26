/**
 * SkeletonLoader.js
 * Lightweight animated skeleton placeholders.
 * Replace ActivityIndicator spinners with these for zero perceived loading time.
 *
 * USAGE:
 *   import { SkeletonCard, SkeletonRow, SkeletonText, SkeletonAvatar } from '../Components/SkeletonLoader';
 *
 *   {isLoading ? <SkeletonCard /> : <CourseCard data={item} />}
 *   {isLoading ? <SkeletonList count={5} /> : <RealList data={data} />}
 */

import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

// Base shimmer animation hook — shared across all skeleton components
function useShimmer() {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return opacity;
}

// Base skeleton block — all shapes derive from this
function SkeletonBlock({ style }) {
  const opacity = useShimmer();
  return (
    <Animated.View style={[styles.base, { opacity }, style]} />
  );
}

/**
 * SkeletonCard — mimics a course card with thumbnail + title + subtitle
 */
export function SkeletonCard({ width: cardWidth = 160, height: cardHeight = 120, style }) {
  return (
    <View style={[styles.card, { width: cardWidth, height: cardHeight }, style]}>
      <SkeletonBlock style={{ flex: 1, borderRadius: 10 }} />
      <SkeletonBlock style={styles.titleLine} />
      <SkeletonBlock style={styles.subtitleLine} />
    </View>
  );
}

/**
 * SkeletonRow — mimics a list row with avatar + text lines
 */
export function SkeletonRow({ style }) {
  return (
    <View style={[styles.row, style]}>
      <SkeletonBlock style={styles.avatar} />
      <View style={styles.textGroup}>
        <SkeletonBlock style={styles.titleLine} />
        <SkeletonBlock style={styles.subtitleLine} />
      </View>
    </View>
  );
}

/**
 * SkeletonText — mimics a text line
 */
export function SkeletonText({ width: w = '80%', style }) {
  return <SkeletonBlock style={[styles.textLine, { width: w }, style]} />;
}

/**
 * SkeletonAvatar — mimics a circular avatar
 */
export function SkeletonAvatar({ size = 40, style }) {
  return (
    <SkeletonBlock
      style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
    />
  );
}

/**
 * SkeletonList — renders N skeleton rows (for list screens)
 */
export function SkeletonList({ count = 5, style }) {
  return (
    <View style={style}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} style={i > 0 ? { marginTop: 12 } : undefined} />
      ))}
    </View>
  );
}

/**
 * SkeletonHorizontalList — renders N skeleton cards in a horizontal row
 */
export function SkeletonHorizontalList({ count = 4, cardWidth = 160, cardHeight = 120 }) {
  return (
    <View style={styles.horizontalList}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard
          key={i}
          width={cardWidth}
          height={cardHeight}
          style={i > 0 ? { marginLeft: 12 } : undefined}
        />
      ))}
    </View>
  );
}

/**
 * SkeletonBanner — mimics a full-width hero banner
 */
export function SkeletonBanner({ height: h = 180, style }) {
  return (
    <SkeletonBlock style={[{ width: '100%', height: h, borderRadius: 16 }, style]} />
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: '#E0E0E0',
    borderRadius: 8,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    padding: 8,
    backgroundColor: '#F5F5F5',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E0E0E0',
    marginRight: 12,
  },
  textGroup: {
    flex: 1,
    gap: 6,
  },
  titleLine: {
    height: 14,
    borderRadius: 7,
    width: '70%',
    backgroundColor: '#E0E0E0',
    marginTop: 6,
  },
  subtitleLine: {
    height: 11,
    borderRadius: 5,
    width: '45%',
    backgroundColor: '#E0E0E0',
    marginTop: 4,
  },
  textLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E0E0E0',
  },
  horizontalList: {
    flexDirection: 'row',
    paddingHorizontal: 16,
  },
});
