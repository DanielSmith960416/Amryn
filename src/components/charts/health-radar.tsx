'use client';

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts';
import { humanise } from '@/lib/utils/format';

/**
 * The health-score radar (specification §18). Six axes, one shape — the point
 * is the silhouette, so the radius axis is unlabelled and the grid is quiet.
 */
export function HealthRadar({
  categories,
  height = 200,
}: {
  categories: { category: string; score: number }[];
  height?: number;
}) {
  if (categories.length < 3) return null;

  const data = categories.map((c) => ({ axis: humanise(c.category), score: c.score }));

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="var(--chart-grid)" />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fill: 'var(--text-tertiary)', fontSize: 10, fontFamily: 'var(--font-label)' }}
          />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            dataKey="score"
            stroke="var(--brand)"
            strokeWidth={2}
            fill="var(--brand)"
            fillOpacity={0.16}
            isAnimationActive={false}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
