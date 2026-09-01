import type { ScoredOpportunity } from '@/lib/intelligence/types';

/**
 * The OpportunityRadar® dial, carried over from the marketing site.
 *
 * The encoding is the marketing site's, and it is worth stating because it is
 * what makes the picture readable at a glance:
 *
 *   · distance from the centre  = how soon it closes (urgent sits at the centre)
 *   · dot size                  = revenue at stake
 *   · angle                     = nothing. It only separates the dots.
 *
 * Angle carries no meaning deliberately. Giving it one — category, say — would
 * imply a spatial relationship between "New Product" and "Cross-Sell" that does
 * not exist.
 */
export function OpportunityDial({
  opportunities,
  size = 300,
}: {
  opportunities: ScoredOpportunity[];
  size?: number;
}) {
  const centre = 150;
  const maxRadius = 132;
  const maxValue = Math.max(1, ...opportunities.map((o) => o.estValue));

  const blips = opportunities.map((o, i) => {
    // Urgency 1 sits at the centre, urgency 0 at the rim.
    const radius = 18 + (1 - o.urgency) * (maxRadius - 18);
    // The golden angle spreads any number of dots without clustering.
    const angle = i * 2.39996 - Math.PI / 2;
    return {
      id: o.id,
      title: o.title,
      cx: centre + radius * Math.cos(angle),
      cy: centre + radius * Math.sin(angle),
      r: 4 + Math.sqrt(o.estValue / maxValue) * 9,
      fill:
        o.classification === 'HIGH'
          ? 'var(--positive)'
          : o.classification === 'MEDIUM'
            ? 'var(--info)'
            : 'var(--text-tertiary)',
    };
  });

  return (
    <figure className="m-0">
      <svg
        viewBox="0 0 300 300"
        style={{ width: size, maxWidth: '100%', height: 'auto' }}
        role="img"
        aria-label={`Opportunity radar showing ${opportunities.length} opportunities. Distance from the centre is how soon each closes; dot size is revenue at stake.`}
      >
        <g stroke="var(--border)" fill="none" strokeWidth="1">
          <circle cx={centre} cy={centre} r="140" />
          <circle cx={centre} cy={centre} r="100" />
          <circle cx={centre} cy={centre} r="60" />
          <circle cx={centre} cy={centre} r="22" />
          <line x1={centre} y1="10" x2={centre} y2="290" />
          <line x1="10" y1={centre} x2="290" y2={centre} />
        </g>

        {/* The sweep is a static wedge, not an animation: a dashboard that
            pulses forever is a dashboard people stop looking at. */}
        <path
          d={`M${centre} ${centre} L${centre} 10 A140 140 0 0 1 249 51 Z`}
          fill="var(--brand)"
          opacity="0.06"
        />

        {blips.map((b) => (
          <g key={b.id}>
            <circle cx={b.cx} cy={b.cy} r={b.r} fill={b.fill} opacity="0.85" />
            <title>{b.title}</title>
          </g>
        ))}
      </svg>
      <figcaption className="mt-2 text-[0.75rem] leading-snug text-[var(--text-tertiary)]">
        Distance from centre = how soon it closes. Dot size = revenue at stake.
      </figcaption>
    </figure>
  );
}
