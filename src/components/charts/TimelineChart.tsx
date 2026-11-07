import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

import type { Course } from "@/api/types";
import { addDays, longDate, shortDate } from "@/lib/dates";
import {
  mondayTicks,
  type DeadlineMark,
  type SuppressedRange,
  type TimelineRow,
} from "@/lib/chart-series";

interface Props {
  rows: TimelineRow[];
  origin: string;
  marks: DeadlineMark[];
  gaps?: SuppressedRange[];
  /** Draw across missing days (personal trend) or break the line (cohort). */
  connectGaps: boolean;
  courses: Map<number, Course>;
  highlightCourseId?: number;
  todayX?: number;
  valueLabel: string;
  minStudents?: number;
  ariaLabel: string;
}

function GapLabel({ viewBox }: { viewBox?: { x: number; y: number; width: number; height: number } }) {
  if (!viewBox) return null;
  const cx = viewBox.x + viewBox.width / 2;
  const cy = viewBox.y + viewBox.height / 2;
  return (
    <text
      x={cx}
      y={cy}
      transform={`rotate(-90 ${cx} ${cy})`}
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize={10}
      fontWeight={600}
      fill="var(--muted-foreground)"
    >
      Not enough responses
    </text>
  );
}

function markerLabel(mark: DeadlineMark, highlight: boolean) {
  const r = Math.max(3.5, Math.min(8, 3 + mark.totalWeight / 6));
  return function Marker({ viewBox }: { viewBox?: { x: number; y: number } }) {
    if (!viewBox) return null;
    return (
      <circle
        cx={viewBox.x}
        cy={viewBox.y - 8}
        r={r}
        fill={highlight ? "var(--deadline-foreground)" : "var(--deadline)"}
        stroke="var(--card)"
        strokeWidth={1.5}
      />
    );
  };
}

export function TimelineChart({
  rows,
  origin,
  marks,
  gaps = [],
  connectGaps,
  courses,
  highlightCourseId,
  todayX,
  valueLabel,
  minStudents,
  ariaLabel,
}: Props) {
  const end = rows.length ? rows[rows.length - 1].date : origin;
  const maxX = rows.length ? rows[rows.length - 1].x : 0;
  const marksByX = new Map(marks.map((m) => [m.x, m]));

  function ChartTooltip({ active, payload }: TooltipProps<number, string>) {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload as TimelineRow;
    const mark = marksByX.get(row.x);
    return (
      <div className="max-w-64 rounded-xl border bg-popover px-3 py-2.5 text-sm shadow-lift">
        <p className="font-semibold">{longDate(row.date)}</p>
        {row.suppressed ? (
          <p className="mt-1 text-muted-foreground">
            Not enough responses
            {minStudents ? ` — fewer than ${minStudents} students checked in.` : "."}
          </p>
        ) : row.value !== null ? (
          <p className="mt-1">
            {valueLabel}: <strong>{row.value}</strong>
            {row.n_students != null && (
              <span className="text-muted-foreground"> · {row.n_students} students</span>
            )}
            {row.sleep_hours != null && (
              <span className="text-muted-foreground"> · {row.sleep_hours}h sleep</span>
            )}
          </p>
        ) : (
          <p className="mt-1 text-muted-foreground">{row.future ? "Still ahead" : "No check-in"}</p>
        )}
        {mark && (
          <ul className="mt-2 space-y-1 border-t pt-2">
            {mark.deadlines.map((d) => (
              <li key={d.id} className="flex justify-between gap-3 text-xs">
                <span>
                  <span className="text-muted-foreground">{courses.get(d.course_id)?.code} </span>
                  {d.title}
                </span>
                <span className="font-semibold">{d.weight_pct === null ? "—" : `${d.weight_pct}%`}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="-mx-2 overflow-x-auto px-2" role="img" aria-label={ariaLabel}>
      <div className="h-72 min-w-[680px] sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 22, right: 12, bottom: 0, left: -18 }}>
            <defs>
              <pattern id="gap-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                <rect width="2.5" height="6" fill="var(--gap)" fillOpacity={0.28} />
              </pattern>
              <linearGradient id="future-fade" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="var(--muted)" stopOpacity={0.9} />
                <stop offset="1" stopColor="var(--muted)" stopOpacity={0.4} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
            <XAxis
              type="number"
              dataKey="x"
              domain={[0, maxX]}
              ticks={mondayTicks(origin, end)}
              tickFormatter={(x: number) => shortDate(addDays(origin, x))}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              allowDataOverflow
            />
            <YAxis
              domain={[0, 10]}
              ticks={[0, 2, 4, 6, 8, 10]}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            {todayX !== undefined && todayX < maxX && (
              <ReferenceArea x1={todayX + 0.5} x2={maxX} fill="url(#future-fade)" ifOverflow="hidden" />
            )}
            {gaps.map((g) => (
              <ReferenceArea
                key={g.startDate}
                x1={g.startX - 0.5}
                x2={g.endX + 0.5}
                fill="url(#gap-hatch)"
                stroke="var(--gap)"
                strokeOpacity={0.25}
                label={<GapLabel />}
                ifOverflow="hidden"
              />
            ))}
            {marks.map((m) => (
              <ReferenceLine
                key={m.date}
                x={m.x}
                stroke="var(--deadline)"
                strokeOpacity={m.totalWeight >= 10 ? 0.85 : 0.4}
                strokeDasharray="3 3"
                label={markerLabel(
                  m,
                  highlightCourseId !== undefined && m.deadlines.some((d) => d.course_id === highlightCourseId),
                )}
              />
            ))}
            {todayX !== undefined && (
              <ReferenceLine
                x={todayX}
                stroke="var(--primary)"
                strokeOpacity={0.5}
                label={{ value: "Today", position: "insideTopRight", fontSize: 10, fill: "var(--primary)", offset: 6 }}
              />
            )}
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--ring)", strokeOpacity: 0.4 }} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--chart-1)"
              strokeWidth={2.5}
              dot={{ r: 2, fill: "var(--chart-1)", strokeWidth: 0 }}
              activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
              connectNulls={connectGaps}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ChartLegend({ items }: { items: { swatch: "line" | "deadline" | "deadline-strong" | "gap"; label: string }[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2">
          {i.swatch === "line" && <span className="h-0.5 w-5 rounded-full bg-chart-1" />}
          {i.swatch === "deadline" && <span className="size-2.5 rounded-full bg-deadline" />}
          {i.swatch === "deadline-strong" && <span className="size-2.5 rounded-full bg-deadline-foreground" />}
          {i.swatch === "gap" && <span className="bg-hatch h-3 w-5 rounded-sm border border-gap/30" />}
          {i.label}
        </li>
      ))}
    </ul>
  );
}
