import { barLayout } from "@/lib/domain/reports";
import { BarChartSvg } from "./bar-chart-svg";

const HEIGHT = 180;
const TOP = 16;
const BOTTOM = 24;

type Point = { label: string; shortLabel: string; value: number };

/**
 * Accessible SVG bar chart (no chart library, no inline style attributes —
 * colours come from the theme tokens via classes). Geometry and labels are
 * computed here on the server; BarChartSvg only draws them.
 * The exact figures are available as a table under the chart.
 */
export function BarChart({
  points,
  label,
  formatValue,
  tableCaption,
  columnLabel,
  valueLabel,
  showTable,
  width = 640,
}: {
  points: Point[];
  label: (max: string) => string;
  formatValue: (value: number) => string;
  tableCaption: string;
  columnLabel: string;
  valueLabel: string;
  showTable: string;
  /** Drawing width in SVG units; wider charts keep text small on large screens. */
  width?: number;
}) {
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const { bars, max } = barLayout(points, width, plotHeight);
  // At most ~8 evenly spaced x-axis labels, counted back from the last day.
  const every = Math.max(1, Math.ceil(points.length / 8));
  const last = bars.length - 1;

  return (
    <figure>
      <BarChartSvg
        width={width}
        height={HEIGHT}
        top={TOP}
        plotHeight={plotHeight}
        ariaLabel={label(formatValue(max))}
        maxLabel={formatValue(max)}
        bars={bars.map((bar, i) => ({
          ...bar,
          title: `${points[i].label} : ${formatValue(points[i].value)}`,
          axisLabel: (last - i) % every === 0 ? points[i].shortLabel : null,
          anchor: i === 0 ? "start" : i === last ? "end" : "middle",
        }))}
      />
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-primary">{showTable}</summary>
        <table className="mt-2 w-full text-sm">
          <caption className="sr-only">{tableCaption}</caption>
          <thead>
            <tr className="text-start text-muted">
              <th scope="col" className="py-1 text-start font-medium">
                {columnLabel}
              </th>
              <th scope="col" className="py-1 text-end font-medium">
                {valueLabel}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {points.map((p) => (
              <tr key={p.label}>
                <td className="py-1">{p.label}</td>
                <td className="py-1 text-end tabular-nums">{formatValue(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
