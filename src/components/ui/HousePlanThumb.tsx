import type { HousePlan } from '../../lib/housePlans/buildPlan';
import { housePlanThumbLayout } from '../../lib/housePlans/housePlanThumb';

/** Top-down plan picture — same role as a material swatch in the catalog. */
export function HousePlanThumb({ plan, floorIndex = 0 }: { plan: HousePlan; floorIndex?: number }) {
  const layout = housePlanThumbLayout(plan, floorIndex);
  const font = Math.max(1.1, Math.min(layout.width, layout.height) * 0.045);
  return (
    <svg viewBox={layout.viewBox} className="house-plan-thumb" aria-hidden="true">
      <rect x="0" y="0" width={layout.width} height={layout.height} fill="#f4f1ea" />
      {layout.rooms.map((room) => (
        <g key={room.id}>
          <path d={room.d} fill={room.fill} stroke="#6b5c4c" strokeWidth={0.18} />
          <text
            x={room.labelX}
            y={room.labelY}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={font}
            fill="#3d342c"
            fontWeight={700}
          >
            {room.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function HousePlanCard({
  plan,
  active,
  onSelect,
}: {
  plan: HousePlan;
  active?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`house-plan-card${active ? ' is-active' : ''}`}
      onClick={onSelect}
      title={`${plan.beds} bed · ${plan.baths} bath · ${plan.livingSqFt.toLocaleString()} sf · ${plan.stories} stor${plan.stories === 1 ? 'y' : 'ies'}`}
    >
      <HousePlanThumb plan={plan} />
      <span className="house-plan-card-copy">
        <strong>{plan.name}</strong>
        <span>
          {plan.beds}/{plan.baths} · {plan.livingSqFt.toLocaleString()} sf · {plan.stories === 1 ? '1 story' : '2 story'}
        </span>
      </span>
    </button>
  );
}
