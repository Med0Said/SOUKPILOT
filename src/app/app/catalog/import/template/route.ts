import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { toCsv } from "@/lib/domain/csv";
import { TEMPLATE_EXAMPLE_ROWS, TEMPLATE_HEADERS } from "@/lib/domain/catalog-import";
import { fr } from "@/i18n/fr";

/**
 * Downloadable import template: UTF-8 with BOM and ";" separator so that
 * Excel in French locales opens it with accents and columns intact.
 */
export async function GET() {
  if (!(await getCurrentUser())) {
    return new NextResponse(fr.common.unauthorized, { status: 401 });
  }
  const body = "﻿" + toCsv([[...TEMPLATE_HEADERS], ...TEMPLATE_EXAMPLE_ROWS.map((r) => [...r])], ";") + "\r\n";
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="modele-import-articles.csv"',
      "Cache-Control": "no-store",
    },
  });
}
