"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  TrendingUp,
  Target,
  Star,
  Info,
  Loader2,
} from "lucide-react";

interface AnalysisResult {
  eligible: boolean;
  eligibilityScore: number;
  reasons: string[];
  riskFactors: string[];
  opportunities: string[];
  missingRequirements: string[];
  recommendation: "high" | "medium" | "low" | "skip";
}

interface AnalysisDialogProps {
  tenderId: string;
  tenderTitle: string;
  onAnalyze: (tenderId: string) => Promise<AnalysisResult | null>;
  children: React.ReactNode;
}

export function AnalysisDialog({
  tenderId,
  tenderTitle,
  onAnalyze,
  children,
}: AnalysisDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await onAnalyze(tenderId);
      if (result) {
        setAnalysis(result);
      } else {
        setError("Analisi non disponibile");
      }
    } catch (err) {
      console.error("Analysis error:", err);
      setError("Errore durante l'analisi");
    } finally {
      setLoading(false);
    }
  }, [onAnalyze, tenderId]);

  // Auto-start analysis when dialog opens
  useEffect(() => {
    if (open && !analysis && !loading && !error) {
      handleAnalyze();
    }
  }, [open, analysis, loading, error, handleAnalyze]);

  const getRecommendationColor = (recommendation: string) => {
    switch (recommendation) {
      case "high":
        return "text-green-600 bg-green-50 border-green-200";
      case "medium":
        return "text-blue-600 bg-blue-50 border-blue-200";
      case "low":
        return "text-orange-600 bg-orange-50 border-orange-200";
      case "skip":
        return "text-red-600 bg-red-50 border-red-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  const getRecommendationLabel = (recommendation: string) => {
    switch (recommendation) {
      case "high":
        return "Alta Raccomandazione";
      case "medium":
        return "Raccomandazione Media";
      case "low":
        return "Bassa Raccomandazione";
      case "skip":
        return "Non Raccomandato";
      default:
        return "N/A";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Analisi Completa del Bando
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Tender Info */}
          <Card className="border-gray-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-gray-900">
                {tenderTitle}
              </CardTitle>
            </CardHeader>
          </Card>

          {/* Loading State */}
          {loading && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="py-8">
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center gap-3 text-blue-600">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="font-medium">Analisi in corso...</span>
                  </div>
                  <p className="text-sm text-blue-500">
                    Stiamo analizzando l&apos;eligibilità del bando per la tua
                    azienda
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error State */}
          {error && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="py-6">
                <div className="text-center space-y-4">
                  <div className="flex items-center justify-center gap-2 text-red-600">
                    <XCircle className="h-5 w-5" />
                    <span className="font-medium">{error}</span>
                  </div>
                  <Button
                    onClick={handleAnalyze}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    <Target className="h-4 w-4" />
                    Riprova Analisi
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Analysis Results */}
          {analysis && (
            <div className="space-y-4">
              {/* Summary */}
              <Card className="border-gray-200">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    {analysis.eligible ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                    Risultato Eligibilità
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Badge
                      className={getRecommendationColor(
                        analysis.recommendation
                      )}
                    >
                      {getRecommendationLabel(analysis.recommendation)}
                    </Badge>
                    <div className="text-2xl font-bold text-blue-600">
                      {Math.round(analysis.eligibilityScore * 100)}%
                    </div>
                  </div>
                  <div className="text-sm text-gray-600">
                    {analysis.eligible
                      ? "La tua azienda è eleggibile per questo bando"
                      : "La tua azienda non è eleggibile per questo bando"}
                  </div>
                </CardContent>
              </Card>

              {/* Reasons */}
              {analysis.reasons.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      Motivi di Eligibilità
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {analysis.reasons.map((reason, index) => (
                        <li
                          key={index}
                          className="flex items-start gap-2 text-sm"
                        >
                          <CheckCircle className="h-3 w-3 text-green-500 mt-1 flex-shrink-0" />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Opportunities */}
              {analysis.opportunities.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-blue-600" />
                      Opportunità
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {analysis.opportunities.map((opportunity, index) => (
                        <li
                          key={index}
                          className="flex items-start gap-2 text-sm"
                        >
                          <Star className="h-3 w-3 text-blue-500 mt-1 flex-shrink-0" />
                          <span>{opportunity}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Risk Factors */}
              {analysis.riskFactors.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-600" />
                      Fattori di Rischio
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {analysis.riskFactors.map((risk, index) => (
                        <li
                          key={index}
                          className="flex items-start gap-2 text-sm"
                        >
                          <AlertTriangle className="h-3 w-3 text-orange-500 mt-1 flex-shrink-0" />
                          <span>{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Missing Requirements */}
              {analysis.missingRequirements.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Info className="h-4 w-4 text-gray-600" />
                      Requisiti Mancanti
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {analysis.missingRequirements.map(
                        (requirement, index) => (
                          <li
                            key={index}
                            className="flex items-start gap-2 text-sm"
                          >
                            <Info className="h-3 w-3 text-gray-500 mt-1 flex-shrink-0" />
                            <span>{requirement}</span>
                          </li>
                        )
                      )}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
