"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ExternalLink,
  Award,
  Zap,
  Users,
  Target,
  AlertCircle,
  CheckCircle,
  Building2,
} from "lucide-react";

interface EnhancedTenderCardProps {
  tender: {
    publicationNumber: string;
    noticeId: string;
    title: string;
    buyer: string;
    publicationDate?: string;
    deadline?: string;
    cpv?: string | string[] | null;
    value?: string;
    pdf?: string;
    description?: string;

    // Enhanced fields
    procedureType?: string;
    contractNature?: string;
    frameworkAgreement?: boolean;
    electronicAuction?: boolean;
    subcontractingAllowed?: boolean;
    placeOfPerformance?: unknown;
    country?: unknown;
    city?: unknown;
    estimatedValue?: number;
  };
  onAnalyzeEligibility?: (tenderId: string) => Promise<unknown>;
}

const PROCEDURE_TYPES = {
  open: "Procedura Aperta",
  restricted: "Procedura Ristretta",
  negotiated: "Procedura Negoziale",
  "competitive-dialogue": "Dialogo Competitivo",
  "innovation-partnership": "Partenariato per l'Innovazione",
  "framework-agreement": "Accordo Quadro",
};

const CONTRACT_NATURES = {
  services: "Servizi",
  supplies: "Forniture",
  works: "Lavori",
  "services-and-supplies": "Servizi e Forniture",
  "works-and-services": "Lavori e Servizi",
};

export function EnhancedTenderCard({
  tender,
  onAnalyzeEligibility,
}: EnhancedTenderCardProps) {
  const { uid } = useAuth();
  const [analyzing, setAnalyzing] = useState(false);
  const [eligibilityResult, setEligibilityResult] = useState<{
    eligible?: boolean;
    eligibilityScore?: number;
    recommendation?: string;
    reasons?: string[];
  } | null>(null);

  const formatValue = (value: number) => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
    }).format(value);
  };

  const getProcedureTypeLabel = (type: string) => {
    return PROCEDURE_TYPES[type as keyof typeof PROCEDURE_TYPES] || type;
  };

  const getContractNatureLabel = (nature: string) => {
    return CONTRACT_NATURES[nature as keyof typeof CONTRACT_NATURES] || nature;
  };

  const getDaysUntilDeadline = (deadline: string) => {
    const deadlineDate = new Date(deadline);
    const today = new Date();
    const diffTime = deadlineDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getUrgencyColor = (days: number) => {
    if (days <= 3) return "text-red-600";
    if (days <= 7) return "text-orange-600";
    if (days <= 14) return "text-yellow-600";
    return "text-green-600";
  };

  const getUrgencyBadge = (days: number) => {
    if (days <= 3) return { label: "Urgente", variant: "destructive" as const };
    if (days <= 7) return { label: "Presto", variant: "secondary" as const };
    if (days <= 14) return { label: "Prossimo", variant: "outline" as const };
    return { label: "Normale", variant: "secondary" as const };
  };

  const handleAnalyzeEligibility = async () => {
    if (!uid || uid === "anon" || !onAnalyzeEligibility) return;

    setAnalyzing(true);
    try {
      onAnalyzeEligibility(tender.noticeId);
    } catch (error) {
      console.error("Error analyzing eligibility:", error);
    } finally {
      setAnalyzing(false);
    }
  };

  const daysUntilDeadline = tender.deadline
    ? getDaysUntilDeadline(tender.deadline)
    : null;
  const urgencyBadge = daysUntilDeadline
    ? getUrgencyBadge(daysUntilDeadline)
    : null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
              {tender.title}
            </h3>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Building2 className="h-4 w-4" />
              <span>{tender.buyer}</span>
            </div>
          </div>
          <div className="text-right">
            {tender.estimatedValue && (
              <div className="text-lg font-semibold text-green-600">
                {formatValue(tender.estimatedValue)}
              </div>
            )}
            <div className="text-sm text-gray-500">
              {tender.publicationNumber}
            </div>
          </div>
        </div>

        {/* Enhanced Details */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          {tender.procedureType && (
            <div>
              <div className="text-xs text-gray-500">Procedura</div>
              <div className="font-medium text-gray-900">
                {getProcedureTypeLabel(tender.procedureType)}
              </div>
            </div>
          )}
          {tender.contractNature && (
            <div>
              <div className="text-xs text-gray-500">Natura</div>
              <div className="font-medium text-gray-900">
                {getContractNatureLabel(tender.contractNature)}
              </div>
            </div>
          )}
          {tender.deadline && (
            <div>
              <div className="text-xs text-gray-500">Scadenza</div>
              <div
                className={`font-medium ${
                  daysUntilDeadline
                    ? getUrgencyColor(daysUntilDeadline)
                    : "text-gray-900"
                }`}
              >
                {new Date(tender.deadline).toLocaleDateString("it-IT")}
                {daysUntilDeadline && (
                  <div className="text-xs">({daysUntilDeadline} giorni)</div>
                )}
              </div>
            </div>
          )}
          {Boolean(tender.city || tender.country) && (
            <div>
              <div className="text-xs text-gray-500">Luogo</div>
              <div className="font-medium text-gray-900">
                {String(tender.city || tender.country || "—")}
              </div>
            </div>
          )}
        </div>

        {/* Special Features */}
        <div className="flex flex-wrap gap-2">
          {tender.frameworkAgreement && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
              <Award className="h-3 w-3" />
              Accordo Quadro
            </span>
          )}
          {tender.electronicAuction && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded-full">
              <Zap className="h-3 w-3" />
              Asta Elettronica
            </span>
          )}
          {tender.subcontractingAllowed && (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
              <Users className="h-3 w-3" />
              Subappalto
            </span>
          )}
          {tender.cpv && (
            <Badge variant="outline">
              CPV: {Array.isArray(tender.cpv) ? tender.cpv[0] : tender.cpv}
            </Badge>
          )}
          {urgencyBadge && (
            <Badge variant={urgencyBadge.variant}>{urgencyBadge.label}</Badge>
          )}
        </div>

        {/* Description */}
        {tender.description && (
          <div className="text-sm text-muted-foreground">
            {tender.description}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-gray-100">
          {tender.pdf && tender.pdf !== "—" && (
            <a
              href={tender.pdf}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              PDF
            </a>
          )}
          {uid && uid !== "anon" && onAnalyzeEligibility && (
            <button
              onClick={handleAnalyzeEligibility}
              disabled={analyzing}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {analyzing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Analisi...
                </>
              ) : (
                <>
                  <Target className="h-4 w-4" />
                  Analizza Eligibilità
                </>
              )}
            </button>
          )}
        </div>

        {/* Eligibility Result */}
        {eligibilityResult && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              {eligibilityResult.eligible ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600" />
              )}
              <span className="font-medium text-gray-900">
                Eligibilità:{" "}
                {eligibilityResult.eligibilityScore
                  ? `${Math.round(eligibilityResult.eligibilityScore * 100)}%`
                  : eligibilityResult.eligible
                  ? "Eligibile"
                  : "Non Eligibile"}
              </span>
            </div>
            {eligibilityResult.recommendation && (
              <div className="text-sm text-gray-700">
                <strong>Raccomandazione:</strong>{" "}
                {eligibilityResult.recommendation}
              </div>
            )}
            {eligibilityResult.reasons &&
              eligibilityResult.reasons.length > 0 && (
                <div className="text-sm mt-1 text-gray-700">
                  <strong>Motivi:</strong>{" "}
                  {eligibilityResult.reasons.join(", ")}
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
}
