"use client";

import type { Bar } from "@/lib/domain/reports";

/**
 * The <svg> part of BarChart. It is a client component on purpose: the
 * server streams large pages in chunks, and a chunk boundary inside server-
 * rendered SVG makes React emit a `<svg style="display:none">` placeholder,
 * which the CSP (no inline style attributes) blocks. A client component
 * receives its props whole and renders the SVG in one piece.
 */
export function BarChartSvg({
  width,
  height,
  top,
  plotHeight,
  bars,
  ariaLabel,
  maxLabel,
}: {
  width: number;
  height: number;
  top: number;
  plotHeight: number;
  bars: (Bar & { title: string; axisLabel: string | null; anchor: "start" | "middle" | "end" })[];
  ariaLabel: string;
  maxLabel: string;
}) {
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={ariaLabel}>
      <line x1="0" x2={width} y1={top} y2={top} className="stroke-border" strokeDasharray="4 4" />
      <text x="2" y={top - 4} className="fill-muted text-[11px]">
        {maxLabel}
      </text>
      <line x1="0" x2={width} y1={top + plotHeight} y2={top + plotHeight} className="stroke-border" />
      {bars.map((bar) => (
        <g key={bar.label}>
          <rect x={bar.x} y={top + bar.y} width={bar.width} height={bar.height} rx="2" className="fill-primary">
            <title>{bar.title}</title>
          </rect>
          {bar.axisLabel ? (
            <text
              x={bar.anchor === "start" ? bar.x : bar.anchor === "end" ? bar.x + bar.width : bar.x + bar.width / 2}
              y={height - 6}
              textAnchor={bar.anchor}
              className="fill-muted text-[11px]"
            >
              {bar.axisLabel}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  );
}
