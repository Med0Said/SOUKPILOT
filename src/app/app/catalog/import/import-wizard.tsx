"use client";

import Link from "next/link";
import { useActionState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Alert, ActionMessage, Badge, Card } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";
import { commitImportAction, previewImportAction, type ImportPreviewState } from "@/app/_actions/catalog";
import { fr } from "@/i18n/fr";

const t = fr.importPage;
const MAX_ROWS_SHOWN = 300;
const idle: ImportPreviewState = { status: "idle" };

export function ImportWizard({ organizationId }: { organizationId: string }) {
  const [preview, previewAction] = useActionState(previewImportAction, idle);
  const [commit, commitAction] = useActionState(commitImportAction, idle);

  if (commit.status === "success" && commit.result) {
    const r = commit.result;
    return (
      <Card>
        <Alert tone="success">{t.done}</Alert>
        <ul className="my-4 space-y-1 text-sm">
          <li>{t.resultProducts(r.products_created, r.variants_created)}</li>
          <li>{t.resultCategories(r.categories_created)}</li>
          <li>{t.resultSuppliers(r.suppliers_created)}</li>
        </ul>
        <div className="flex flex-wrap gap-2">
          <Link href="/app/catalog" className={buttonClasses("primary")}>
            {t.seeCatalog}
          </Link>
          <Link href="/app/catalog/import" className={buttonClasses("secondary")}>
            {t.another}
          </Link>
        </div>
      </Card>
    );
  }

  const analysis = preview.analysis;
  const rows = analysis
    ? [...analysis.rows].sort((a, b) => order(a.status) - order(b.status) || a.line - b.line).slice(0, MAX_ROWS_SHOWN)
    : [];

  return (
    <>
      <Card>
        <form action={previewAction} className="space-y-3">
          <input type="hidden" name="organizationId" value={organizationId} />
          <label htmlFor="file" className="block text-sm font-medium">
            {t.fileLabel}
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".csv,text/csv,text/plain"
            required
            className="block w-full text-sm file:me-3 file:min-h-11 file:rounded-lg file:border file:border-border file:bg-surface file:px-4"
          />
          <SubmitButton pendingLabel={t.analyzing}>{t.preview}</SubmitButton>
        </form>
      </Card>

      {preview.status === "error" ? <ActionMessage state={preview} /> : null}

      {analysis ? (
        <Card>
          <h2 className="mb-3 font-semibold">
            {t.previewTitle} {preview.fileName ? <span className="font-normal text-muted">— {preview.fileName}</span> : null}
          </h2>
          {analysis.fatalErrors.map((m) => (
            <Alert key={m} tone="error">
              {m}
            </Alert>
          ))}
          {analysis.warnings.length > 0 ? (
            <ul className="mb-3 list-disc space-y-1 ps-5 text-sm text-muted">
              {analysis.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          {analysis.summary.totalRows > 0 ? (
            <dl className="mb-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <Stat label={t.rowsOk} value={analysis.summary.okRows} />
              <Stat label={t.rowsError} value={analysis.summary.errorRows} />
              <Stat label={t.rowsSkipped} value={analysis.summary.skippedRows} />
              <Stat label={t.toCreate} value={`${analysis.summary.products} / ${analysis.summary.variants}`} />
            </dl>
          ) : null}

          {preview.batchId ? (
            <form action={commitAction} className="mb-4 space-y-2 rounded-lg bg-background p-3">
              <input type="hidden" name="batchId" value={preview.batchId} />
              <ActionMessage state={commit} />
              <p className="text-sm">
                {t.confirmText(analysis.summary.products, analysis.summary.variants)}
                {analysis.summary.errorRows + analysis.summary.skippedRows > 0 ? ` ${t.confirmSkipped}` : ""}
              </p>
              <SubmitButton pendingLabel={t.importing}>{t.confirm}</SubmitButton>
            </form>
          ) : null}

          {rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead>
                  <tr className="border-b border-border text-muted">
                    <th scope="col" className="p-2 text-start font-medium">{t.line}</th>
                    <th scope="col" className="p-2 text-start font-medium">{t.product}</th>
                    <th scope="col" className="p-2 text-start font-medium">{t.status}</th>
                    <th scope="col" className="p-2 text-start font-medium">{t.messages}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.line} className="border-b border-border align-top">
                      <td className="p-2 tabular-nums">{r.line}</td>
                      <td className="p-2">
                        {r.productName || "—"}
                        <span className="block text-xs text-muted">{r.variantLabel}</span>
                      </td>
                      <td className="p-2">
                        <Badge tone={r.status === "ok" ? "success" : r.status === "error" ? "danger" : "warning"}>
                          {t.statusLabel[r.status]}
                        </Badge>
                      </td>
                      <td className="p-2">
                        {r.messages.length > 0 ? (
                          <ul className="space-y-0.5">
                            {r.messages.map((m) => (
                              <li key={m}>{m}</li>
                            ))}
                          </ul>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {analysis.rows.length > MAX_ROWS_SHOWN ? (
                <p className="mt-2 text-xs text-muted">{t.truncated(MAX_ROWS_SHOWN, analysis.rows.length)}</p>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}

function order(status: "ok" | "error" | "skipped"): number {
  return status === "error" ? 0 : status === "skipped" ? 1 : 2;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border p-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
