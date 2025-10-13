"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AnalysisDialog } from "@/components/AnalysisDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Target,
  TrendingUp,
  Award,
  Euro,
  Building2,
  AlertCircle,
  Star,
  RefreshCcw,
  ExternalLink,
  FileText,
} from "lucide-react";

const BASE_URL = process.env.NEXT_PUBLIC_TENDER_API_BASE ?? "";

interface BestTender {
  tenderId: string;
  title: string;
  buyer: string;
  value?: number;
  deadline?: string;
  cpv: string[];
  pdfUrl?: string;
  tedPageUrl?: string;
  eligibilityScore: number;
  recommendation: "high" | "medium" | "low" | "skip";
  reasons: string[];
  riskFactors: string[];
  opportunities: string[];
}

interface DashboardStats {
  totalTenders: number;
  highRecommendations: number;
  mediumRecommendations: number;
  lowRecommendations: number;
  avgEligibilityScore: number;
  avgCompetitionScore: number;
  totalValue: number;
}

export default function PersonalizedDashboard() {
  const { uid, idToken, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [tenders, setTenders] = useState<BestTender[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [filters, setFilters] = useState({
    daysBack: 7,
    limit: 20,
    regions: [] as string[],
    cpvCodes: [] as string[],
  });

  const fetchBestTenders = useCallback(async () => {
    if (!uid || uid === "anon") return;

    setLoading(true);
    try {
      const headers: HeadersInit = {
        "x-user-id": uid,
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        "Content-Type": "application/json",
      };

      const response = await fetch(`${BASE_URL}/getBestTenders`, {
        method: "POST",
        headers,
        body: JSON.stringify(filters),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setTenders(data.tenders || []);

      // Calculate stats
      if (data.tenders && data.tenders.length > 0) {
        const totalTenders = data.tenders.length;
        const highRecs = data.tenders.filter(
          (t: BestTender) => t.recommendation === "high"
        ).length;
        const mediumRecs = data.tenders.filter(
          (t: BestTender) => t.recommendation === "medium"
        ).length;
        const lowRecs = data.tenders.filter(
          (t: BestTender) => t.recommendation === "low"
        ).length;
        const avgEligibility =
          data.tenders.reduce(
            (sum: number, t: BestTender) => sum + t.eligibilityScore,
            0
          ) / totalTenders;
        const avgCompetition = 0; // Not available in current API
        const totalValue = data.tenders.reduce(
          (sum: number, t: BestTender) => sum + (t.value || 0),
          0
        );

        setStats({
          totalTenders,
          highRecommendations: highRecs,
          mediumRecommendations: mediumRecs,
          lowRecommendations: lowRecs,
          avgEligibilityScore: avgEligibility,
          avgCompetitionScore: avgCompetition,
          totalValue,
        });
      }
    } catch (error) {
      console.error("Error fetching best tenders:", error);
    } finally {
      setLoading(false);
    }
  }, [uid, idToken, filters]);

  useEffect(() => {
    if (uid && idToken && !authLoading) {
      fetchBestTenders();
    }
  }, [uid, idToken, authLoading, filters, fetchBestTenders]);

  const formatValue = (value: number) => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
    }).format(value);
  };

  const handleAnalyzeTender = async (tenderId: string) => {
    try {
      const headers: HeadersInit = {
        "x-user-id": uid ?? "anon",
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        "Content-Type": "application/json",
      };

      const response = await fetch(`${BASE_URL}/analyzeEligibility`, {
        method: "POST",
        headers,
        body: JSON.stringify({ tenderId }),
      });

      if (response.ok) {
        const analysis = await response.json();

        if (analysis.reasons && analysis.reasons.includes("Analysis failed")) {
          toast.info("Analisi non disponibile", {
            description: "L'analisi dettagliata sarà disponibile presto!",
            duration: 4000,
          });
          return null;
        } else {
          return analysis;
        }
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error("Error analyzing tender:", error);
      toast.error("Errore nell'analisi", {
        description: "Impossibile analizzare il bando. Riprova più tardi.",
        duration: 4000,
      });
      return null;
    }
  };

  const handleSaveFavorite = async (tender: BestTender) => {
    try {
      const headers: HeadersInit = {
        "x-user-id": uid ?? "anon",
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        "Content-Type": "application/json",
      };

      const response = await fetch(`${BASE_URL}/saveFavorite`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          tenderId: tender.tenderId,
        }),
      });

      if (response.ok) {
        toast.success("Bando salvato!", {
          description: "Il bando è stato aggiunto ai tuoi preferiti",
          duration: 3000,
        });
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error("Error saving favorite:", error);
      toast.error("Errore nel salvataggio", {
        description:
          "Impossibile salvare il bando nei preferiti. Riprova più tardi.",
        duration: 4000,
      });
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Caricamento dashboard personalizzata...</p>
        </div>
      </div>
    );
  }

  if (!uid || uid === "anon") {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4 text-center">
        <AlertCircle className="h-12 w-12 text-yellow-500 mb-4" />
        <h1 className="text-2xl font-bold mb-2">Accesso Richiesto</h1>
        <p className="text-muted-foreground mb-4">
          Per visualizzare la dashboard personalizzata, devi effettuare
          l&apos;accesso e completare il profilo aziendale.
        </p>
        <Button asChild>
          <a href="/profilo-aziendale">Completa Profilo</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">
              Dashboard Personalizzata
            </h1>
            <p className="text-muted-foreground">
              I migliori bandi per la tua azienda, analizzati con intelligenza
              artificiale.
            </p>
          </div>
          <Button
            onClick={fetchBestTenders}
            disabled={loading}
            variant="outline"
          >
            <RefreshCcw className="h-4 w-4 mr-2" />
            Aggiorna
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Target className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">
                    Totale Bandi
                  </p>
                  <p className="text-2xl font-bold">{stats.totalTenders}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <TrendingUp className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">
                    Alta Priorità
                  </p>
                  <p className="text-2xl font-bold text-green-600">
                    {stats.highRecommendations}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Euro className="h-8 w-8 text-purple-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">
                    Valore Totale
                  </p>
                  <p className="text-2xl font-bold">
                    {formatValue(stats.totalValue)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Award className="h-8 w-8 text-orange-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">
                    Eligibilità Media
                  </p>
                  <p className="text-2xl font-bold">
                    {Math.round(stats.avgEligibilityScore * 100)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Filtri Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Giorni Indietro
              </label>
              <Select
                value={filters.daysBack.toString()}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, daysBack: Number(value) }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">Ultimi 3 giorni</SelectItem>
                  <SelectItem value="7">Ultima settimana</SelectItem>
                  <SelectItem value="14">Ultime 2 settimane</SelectItem>
                  <SelectItem value="30">Ultimo mese</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">
                Numero Risultati
              </label>
              <Select
                value={filters.limit.toString()}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, limit: Number(value) }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 risultati</SelectItem>
                  <SelectItem value="20">20 risultati</SelectItem>
                  <SelectItem value="50">50 risultati</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tenders Grid */}
      {tenders.length > 0 ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              Bandi Consigliati
            </h2>
            <div className="text-sm text-gray-500">
              {tenders.length} risultati
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tenders.map((tender, index) => (
              <Card
                key={index}
                className="group hover:shadow-lg transition-all duration-200 border-gray-200 hover:border-gray-300"
              >
                <CardContent className="p-4">
                  {/* Header */}
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <Badge
                        className={`text-xs font-medium ${
                          tender.recommendation === "high"
                            ? "bg-green-100 text-green-700 border-green-200"
                            : tender.recommendation === "medium"
                            ? "bg-blue-100 text-blue-700 border-blue-200"
                            : tender.recommendation === "low"
                            ? "bg-orange-100 text-orange-700 border-orange-200"
                            : "bg-gray-100 text-gray-700 border-gray-200"
                        }`}
                      >
                        {tender.recommendation === "high"
                          ? "Alta"
                          : tender.recommendation === "medium"
                          ? "Media"
                          : tender.recommendation === "low"
                          ? "Bassa"
                          : "Skip"}
                      </Badge>
                      <div className="text-right">
                        <div className="text-xs text-gray-500 font-mono">
                          {tender.tenderId}
                        </div>
                      </div>
                    </div>

                    {/* Title */}
                    <h3 className="text-sm font-medium text-gray-900 line-clamp-3 leading-tight">
                      {tender.title}
                    </h3>

                    {/* Buyer */}
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <Building2 className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{tender.buyer}</span>
                    </div>
                  </div>

                  {/* Value & Score */}
                  <div className="mt-3 pt-2 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                      {tender.value ? (
                        <div className="text-sm font-semibold text-green-600">
                          {formatValue(tender.value)}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400">Valore N/A</div>
                      )}
                      <div className="flex items-center gap-1">
                        <div className="text-xs text-gray-500">Score:</div>
                        <div className="text-sm font-medium text-blue-600">
                          {Math.round((tender.eligibilityScore || 0) * 100)}%
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-3 pt-2 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <AnalysisDialog
                                  tenderId={tender.tenderId}
                                  tenderTitle={tender.title}
                                  onAnalyze={handleAnalyzeTender}
                                >
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-xs hover:bg-gray-100 cursor-pointer"
                                  >
                                    <Target className="h-3 w-3" />
                                  </Button>
                                </AnalysisDialog>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Analisi Completa</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-xs hover:bg-gray-100 cursor-pointer"
                                onClick={() => handleSaveFavorite(tender)}
                              >
                                <Star className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Salva nei Preferiti</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>

                      <div className="flex gap-1">
                        {tender.tedPageUrl && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-xs hover:bg-gray-100 cursor-pointer"
                                  asChild
                                >
                                  <a
                                    href={tender.tedPageUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Apri TED Page</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {tender.pdfUrl && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-xs hover:bg-gray-100 cursor-pointer"
                                  asChild
                                >
                                  <a
                                    href={tender.pdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <FileText className="h-3 w-3" />
                                  </a>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Scarica PDF</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nessun bando trovato</h3>
            <p className="text-muted-foreground mb-4">
              Completa il tuo profilo aziendale per ricevere raccomandazioni
              personalizzate.
            </p>
            <Button asChild>
              <a href="/profilo-aziendale">Completa Profilo</a>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
