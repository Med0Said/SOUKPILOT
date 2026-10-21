import "server-only";
import { NextResponse } from "next/server";
import { getActiveContext, hasPermission, type OrgContext } from "@/lib/auth/organization";
import type { Permission } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { toCsv } from "@/lib/domain/csv";
import { EXPORT_MAX_ROWS, exportFileName, type CsvTable } from "@/lib/domain/exports";
import { todayIn } from "@/lib/ui/list-params";
import { logger } from "@/lib/logger";
import { fr } from "@/i18n/fr";

/**
 * Export route guard: signed in, member of an organization, and (optionally)
 * allowed to see the page being exported. Data is then read with the user's
 * own client, so RLS applies exactly as on screen.
 */
export async function exportContext(permission?: Permission): Promise<OrgContext | NextResponse> {
  if (!(await getCurrentUser())) return new NextResponse(fr.common.unauthorized, { status: 401 });
  const context = await getActiveContext();
  if (!context) return new NextResponse(fr.common.noOrganization, { status: 403 });
  if (permission && !hasPermission(context, permission)) return new NextResponse(fr.common.forbidden, { status: 403 });
  return context;
}

type Page<T> = PromiseLike<{ data: T[] | null; error: { code?: string } | null }>;

/**
 * Reads a paginated source page by page, up to EXPORT_MAX_ROWS rows.
 * `pageSize` must not exceed the source's own limit, or rows would be skipped.
 */
export async function collectPages<T>(
  fetchPage: (offset: number, limit: number) => Page<T>,
  pageSize: number,
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  while (rows.length < EXPORT_MAX_ROWS) {
    const limit = Math.min(pageSize, EXPORT_MAX_ROWS - rows.length);
    const { data, error } = await fetchPage(rows.length, limit);
    if (error) return { rows, error: error.code ?? "unknown" };
    rows.push(...(data ?? []));
    if ((data ?? []).length < limit) break;
  }
  return { rows, error: null };
}

/**
 * UTF-8 with BOM and ";" separator: Excel and LibreOffice in French locales
 * open it with accents and columns intact. `fileBase` gets today's date
 * appended unless `dated` is false (a report file already names its period).
 */
export function csvResponse(context: OrgContext, kind: string, fileBase: string, table: CsvTable, dated = true): NextResponse {
  logger.info("export.csv", {
    organizationId: context.membership.organizationId,
    userId: context.user.id,
    kind,
    rows: table.length - 1,
  });
  const fileName = dated ? exportFileName(fileBase, todayIn(context.membership.timezone)) : `${fileBase}.csv`;
  return new NextResponse("﻿" + toCsv(table, ";") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function exportFailed(context: OrgContext, kind: string, code: string): NextResponse {
  logger.error("export.failed", { organizationId: context.membership.organizationId, kind, code });
  return new NextResponse("L'export a échoué. Réessayez dans un instant.", { status: 500 });
}
