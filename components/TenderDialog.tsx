"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink } from "lucide-react";
import { trackEvent } from "@/lib/trackEvent";

type LangMap = Record<string, string | string[]>;

type Tender = {
  id: string;
  title: string;
  buyer: string;
  publicationDate?: string;
  deadline?: string;
  cpv?: string | string[] | null;
  links?: {
    pdf?: LangMap;
    html?: LangMap;
    htmlDirect?: LangMap;
  } | null;
  summary_it?: string | null;
  summary_en?: string | null;
};

function firstString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v))
    return v.find((x): x is string => typeof x === "string");
  return undefined;
}

function pickPdfItaOrEn(links?: Tender["links"] | null): string | null {
  const pdf = links?.pdf;
  if (!pdf) return null;

  const preferred = ["it", "ita", "IT", "ITA", "eng", "en", "EN", "ENG"];
  for (const k of Object.keys(pdf)) {
    if (preferred.includes(k)) {
      const s = firstString(pdf[k]);
      if (s) return s;
    }
  }

  const anyKey = Object.keys(pdf)[0];
  return anyKey ? firstString(pdf[anyKey]) ?? null : null;
}

export function TenderDialog({
  tenderId,
  baseUrl,
}: {
  tenderId: string;
  baseUrl: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [t, setT] = React.useState<Tender | null>(null);

  async function load() {
    setOpen(true);
    if (t) return;
    setLoading(true);
    await trackEvent("open_detail", tenderId, { referrer: "app" });
    try {
      const res = await fetch(
        `${baseUrl}/tenderGet?id=${encodeURIComponent(tenderId)}`,
        { cache: "no-store" }
      );
      const data: Tender = await res.json();
      setT(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const pdf = pickPdfItaOrEn(t?.links ?? null);
  const tedUrl = `https://ted.europa.eu/it/notice/-/detail/${encodeURIComponent(
    tenderId
  )}`;

  return (
    <>
      <Button size="sm" variant="secondary" onClick={load}>
        Dettagli
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40">
          <div className="absolute left-1/2 top-1/2 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Bando {tenderId}</h3>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Chiudi
              </Button>
            </div>
            {loading ? (
              <div className="mt-6 text-sm text-muted-foreground flex gap-2 items-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Caricamento…
              </div>
            ) : t ? (
              <div className="mt-4 space-y-3 text-sm">
                <div className="font-semibold">{t.title}</div>
                <div className="text-muted-foreground">{t.buyer}</div>
                <div className="flex flex-wrap gap-2 text-[12px]">
                  {t.publicationDate && (
                    <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5">
                      Pubblicazione: {String(t.publicationDate).slice(0, 10)}
                    </span>
                  )}
                  {t.deadline && (
                    <span className="rounded bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5">
                      Scadenza: {String(t.deadline).slice(0, 10)}
                    </span>
                  )}
                  {t.cpv && (
                    <span className="rounded bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5">
                      CPV {Array.isArray(t.cpv) ? t.cpv[0] : t.cpv}
                    </span>
                  )}
                </div>

                {t.summary_it && (
                  <p className="mt-2 leading-snug">{t.summary_it}</p>
                )}
                {t.summary_en && (
                  <p className="text-xs text-muted-foreground">
                    EN: {t.summary_en}
                  </p>
                )}

                <div className="flex gap-2 pt-2">
                  <Button asChild size="sm" className="gap-1">
                    <a href={tedUrl} target="_blank" rel="noopener">
                      Apri su TED <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                  {pdf && (
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="gap-1"
                    >
                      <a href={pdf} target="_blank" rel="noopener">
                        PDF <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-muted-foreground">
                Nessun dettaglio disponibile.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
