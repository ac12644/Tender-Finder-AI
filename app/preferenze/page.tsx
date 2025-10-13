"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Check, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { IT_REGIONS, CPV_SUGGESTIONS } from "@/data";

const BASE_URL = process.env.NEXT_PUBLIC_TENDER_API_BASE ?? "";

type Prefs = {
  regions: string[];
  cpv: string[];
  daysBack: number;
  minValue: number | null;
  sectors: string[];
  notifyDaily: boolean;
};

type ApiPrefsResp = { preferences: Prefs };

function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-3 py-1.5 rounded-full border text-sm transition",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background hover:bg-muted border-border",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export default function PreferencesPage() {
  const { uid, idToken } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [regions, setRegions] = useState<string[]>([]);
  const [cpv, setCpv] = useState<string[]>([]);
  const [daysBack, setDaysBack] = useState<number>(7);
  const [minValue, setMinValue] = useState<number | null>(null);
  const [notifyDaily, setNotifyDaily] = useState<boolean>(false);

  const headers: HeadersInit = {
    "x-user-id": uid ?? "anon",
    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${BASE_URL}/preferences`, {
          headers,
          cache: "no-store",
        });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as ApiPrefsResp;
        if (!alive) return;
        const p = data.preferences;
        setRegions(p.regions ?? []);
        setCpv(p.cpv ?? []);
        setDaysBack(p.daysBack ?? 7);
        setMinValue(p.minValue ?? null);
        setNotifyDaily(!!p.notifyDaily);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Errore nel caricamento");
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [uid]);

  async function saveAll() {
    try {
      setSaving(true);
      setError(null);
      const body: Prefs = {
        regions,
        cpv,
        daysBack,
        minValue,
        sectors: [],
        notifyDaily,
      };
      const res = await fetch(`${BASE_URL}/preferences`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(await res.text());
      router.push("/per-te");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function Step1() {
    const toggle = (r: string) =>
      setRegions((prev) =>
        prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
      );

    return (
      <Card>
        <CardContent className="p-4 sm:p-6">
          <h2 className="text-lg font-semibold">Dove vuoi cercare?</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Seleziona una o più regioni italiane (opzionale).
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {IT_REGIONS.map((r) => (
              <Chip
                key={r}
                active={regions.includes(r)}
                onClick={() => toggle(r)}
              >
                {r}
              </Chip>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <div />
            <Button onClick={() => setStep(2)} className="gap-1">
              Avanti <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  function Step2() {
    const MAX_CPV = 40;
    const [filter, setFilter] = React.useState("");

    const toggleCpv = (code: string) =>
      setCpv((prev) =>
        prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]
      );

    const uniqueSuggestions = React.useMemo(() => {
      const byCode = new Map<string, (typeof CPV_SUGGESTIONS)[number]>();
      for (const item of CPV_SUGGESTIONS) {
        if (!byCode.has(item.code)) byCode.set(item.code, item);
      }
      return Array.from(byCode.values());
    }, []);

    const filteredAll = React.useMemo(() => {
      const q = filter.trim().toLowerCase();
      if (!q) return uniqueSuggestions;

      const qDigits = q.replace(/\D/g, "");
      return uniqueSuggestions.filter((c) => {
        const lbl = c.label.toLowerCase();
        return (
          lbl.includes(q) ||
          c.code.includes(q) ||
          (qDigits.length > 0 && c.code.includes(qDigits))
        );
      });
    }, [filter, uniqueSuggestions]);

    const selectedMatches = filteredAll.filter((c) => cpv.includes(c.code));
    const unselectedMatches = filteredAll
      .filter((c) => !cpv.includes(c.code))
      .sort((a, b) => a.label.localeCompare(b.label, "it"));

    const totalMatches = filteredAll.length;
    const atLimit = cpv.length >= MAX_CPV;

    return (
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Cosa ti interessa?</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Scegli codici CPV tipici (puoi aggiungerne fino a {MAX_CPV}).
              </p>
            </div>
            <div className="w-full sm:w-80">
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtra per nome o codice"
                aria-label="Filtra CPV"
                className="h-10"
              />
            </div>
          </div>

          {/* Selezionati (pinned, solo se matchano il filtro o non c'è filtro) */}
          {cpv.length > 0 && (
            <div className="mt-4">
              <div className="text-xs text-muted-foreground mb-2">
                Selezionati: {cpv.length}/{MAX_CPV}
              </div>
              <div className="flex flex-wrap gap-2">
                {(filter
                  ? selectedMatches
                  : uniqueSuggestions.filter((c) => cpv.includes(c.code))
                ).map((c) => (
                  <Chip
                    key={`sel-${c.code}`}
                    active
                    onClick={() => toggleCpv(c.code)}
                  >
                    {c.label}{" "}
                    <span className="text-xs opacity-70 ml-1">({c.code})</span>
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {/* Risultati (solo NON selezionati) + contatore corretto */}
          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {totalMatches} risultati
              {filter.trim() ? ` per “${filter.trim()}”` : ""}
            </div>
            {atLimit && (
              <div className="text-xs text-amber-600">
                Limite raggiunto: {MAX_CPV} codici
              </div>
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {unselectedMatches.map((c) => (
              <Chip
                key={c.code}
                active={false}
                onClick={() => (!atLimit ? toggleCpv(c.code) : undefined)}
              >
                {c.label}{" "}
                <span className="text-xs opacity-70 ml-1">({c.code})</span>
              </Chip>
            ))}
          </div>

          {/* Aggiunta manuale invariata */}
          <div className="mt-6">
            <label className="text-sm font-medium">
              Aggiungi CPV manualmente
            </label>
            <div className="mt-2 flex gap-2">
              <Input
                placeholder="es. 90911200"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const v = (e.currentTarget.value || "").trim();
                    if (/^\d{8}$/.test(v) && !cpv.includes(v) && !atLimit) {
                      setCpv((p) => [...p, v]);
                    }
                    e.currentTarget.value = "";
                  }
                }}
              />
              <Button type="button" variant="outline" disabled>
                Aggiungi
              </Button>
            </div>
            {cpv.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {cpv.map((c) => (
                  <Badge
                    key={`tag-${c}`}
                    variant="secondary"
                    className="flex items-center gap-1 px-2 py-1"
                  >
                    {c}
                    <button
                      onClick={() => setCpv((p) => p.filter((x) => x !== c))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => setStep(1)}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" /> Indietro
            </Button>
            <Button onClick={() => setStep(3)} className="gap-1">
              Avanti <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  function Step3() {
    return (
      <Card>
        <CardContent className="p-4 sm:p-6">
          <h2 className="text-lg font-semibold">Riepilogo</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Controlla e salva le tue preferenze.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-sm font-medium">Regioni</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {regions.length ? (
                  regions.map((r) => <Badge key={r}>{r}</Badge>)
                ) : (
                  <span className="text-sm text-muted-foreground">
                    Nessuna (Italia intera)
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium">CPV</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {cpv.length ? (
                  cpv.map((c) => (
                    <Badge key={c} variant="secondary">
                      {c}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">
                    Nessuno specificato
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium">Ultimi giorni</div>
              <div className="mt-2">{daysBack}</div>
            </div>
            <div>
              <div className="text-sm font-medium">Valore minimo</div>
              <div className="mt-2">
                {minValue != null ? `${minValue} €` : "—"}
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => setStep(2)}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" /> Indietro
            </Button>
            <Button onClick={saveAll} disabled={saving} className="gap-2">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Salva preferenze
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8 py-6">
      <h1 className="text-xl font-semibold">Preferenze</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Personalizza la tua ricerca bandi in Italia. Interfaccia minimale, solo
        ciò che serve.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/40 text-destructive bg-destructive/5 p-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-8 flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Caricamento preferenze…
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          <div className="flex items-center gap-2">
            <Badge variant={step === 1 ? "default" : "secondary"}>1</Badge>
            <span className="text-sm">Regioni</span>
            <div className="w-8 border-t mx-2 opacity-30" />
            <Badge variant={step === 2 ? "default" : "secondary"}>2</Badge>
            <span className="text-sm">CPV & Filtri</span>
            <div className="w-8 border-t mx-2 opacity-30" />
            <Badge variant={step === 3 ? "default" : "secondary"}>3</Badge>
            <span className="text-sm">Conferma</span>
          </div>

          {step === 1 && <Step1 />}
          {step === 2 && <Step2 />}
          {step === 3 && <Step3 />}
        </div>
      )}
    </div>
  );
}
