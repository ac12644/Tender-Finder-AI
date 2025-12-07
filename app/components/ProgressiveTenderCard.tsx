"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  Building2,
  Calendar,
  FileText,
  ExternalLink,
  Target,
  Award,
} from "lucide-react";
import { AnalysisDialog } from "@/components/AnalysisDialog";

export interface AnalysisResult {
  eligible: boolean;
  eligibilityScore: number;
  reasons: string[];
  riskFactors: string[];
  opportunities: string[];
  missingRequirements: string[];
  recommendation: "high" | "medium" | "low" | "skip";
}

interface Tender {
  publicationNumber: string;
  noticeId?: string;
  title: string;
  buyer: string;
  publicationDate?: string;
  deadline?: string;
  cpv?: string | string[];
  value?: number | string;
  pdf?: string;
  description?: string;
  // Enhanced fields
  procedureType?: string;
  contractNature?: string;
  frameworkAgreement?: boolean;
  electronicAuction?: boolean;
  eligibilityScore?: number;
  recommendation?: "high" | "medium" | "low" | "skip";
}

interface ProgressiveTenderCardProps {
  tender: Tender;
  onAnalyzeEligibility?: (
    tenderId: string,
    tenderData?: {
      title?: string;
      buyer?: string;
      cpv?: string | string[];
      deadline?: string;
      value?: number;
    }
  ) => Promise<AnalysisResult | null>;
  analyzingTender?: string | null;
}

/**
 * Progressive Tender Card with expandable details.
 *
 * Shows summary by default, details on demand.
 * Follows progressive disclosure UX pattern.
 */
export function ProgressiveTenderCard({
  tender,
  onAnalyzeEligibility,
}: ProgressiveTenderCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [detailsLoaded, setDetailsLoaded] = useState(false);

  const formatValue = (value: number | string | undefined) => {
    if (!value) return "N/A";
    if (typeof value === "number") {
      return new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 0,
      }).format(value);
    }
    return value;
  };

  const formatDate = (date?: string) => {
    if (!date) return "N/A";
    try {
      return new Date(date).toLocaleDateString("it-IT");
    } catch {
      return date;
    }
  };

  const getDaysUntilDeadline = (deadline?: string) => {
    if (!deadline) return null;
    try {
      const deadlineDate = new Date(deadline);
      const today = new Date();
      const diffTime = deadlineDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    } catch {
      return null;
    }
  };

  const daysUntilDeadline = getDaysUntilDeadline(tender.deadline);
  const isUrgent = daysUntilDeadline !== null && daysUntilDeadline <= 7;

  const getRecommendationColor = (rec?: string) => {
    switch (rec) {
      case "high":
        return "bg-green-100 text-green-700 border-green-200";
      case "medium":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "low":
        return "bg-orange-100 text-orange-700 border-orange-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow border-gray-200 w-full overflow-hidden">
      <CardHeader className="pb-3 px-4 sm:px-6">
        <div className="flex items-start justify-between gap-3 w-full overflow-hidden">
          <div className="flex-1 min-w-0 pr-2">
            <CardTitle className="text-base font-semibold text-gray-900 line-clamp-2 mb-2 break-words overflow-hidden">
              {tender.title}
            </CardTitle>
            <div className="flex items-center gap-2 text-sm text-gray-600 min-w-0 overflow-hidden">
              <Building2 className="h-4 w-4 flex-shrink-0" />
              <span className="truncate min-w-0">{tender.buyer}</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            {tender.value && (
              <div className="text-sm font-semibold text-green-600 text-right break-words max-w-[120px]">
                {formatValue(tender.value)}
              </div>
            )}
            {tender.recommendation && (
              <Badge className={getRecommendationColor(tender.recommendation)}>
                {tender.recommendation === "high"
                  ? "Alta"
                  : tender.recommendation === "medium"
                  ? "Media"
                  : tender.recommendation === "low"
                  ? "Bassa"
                  : "Skip"}
              </Badge>
            )}
          </div>
        </div>

        {/* Summary badges - always visible */}
        <div className="flex flex-wrap gap-2 mt-3">
          {tender.deadline && (
            <Badge
              variant={isUrgent ? "destructive" : "secondary"}
              className="text-xs"
            >
              <Calendar className="h-3 w-3 mr-1 flex-shrink-0" />
              <span className="inline-flex items-center flex-wrap gap-1">
                <span>Scadenza: {formatDate(tender.deadline)}</span>
                {daysUntilDeadline !== null && (
                  <span>
                    (
                    {daysUntilDeadline > 0
                      ? `${daysUntilDeadline} giorni`
                      : "Scaduto"}
                    )
                  </span>
                )}
              </span>
            </Badge>
          )}
          {tender.cpv && (
            <Badge variant="outline" className="text-xs">
              CPV: {Array.isArray(tender.cpv) ? tender.cpv[0] : tender.cpv}
            </Badge>
          )}
          {tender.eligibilityScore !== undefined && (
            <Badge variant="outline" className="text-xs">
              <Target className="h-3 w-3 mr-1" />
              Score: {Math.round(tender.eligibilityScore * 100)}%
            </Badge>
          )}
        </div>
      </CardHeader>

      {/* Expandable details */}
      {expanded && (
        <CardContent className="pt-0 space-y-4 border-t border-gray-100 px-4 sm:px-6">
          {/* Enhanced details */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            {tender.procedureType && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Tipo Procedura</div>
                <div className="font-medium">{tender.procedureType}</div>
              </div>
            )}
            {tender.contractNature && (
              <div>
                <div className="text-xs text-gray-500 mb-1">
                  Natura Contratto
                </div>
                <div className="font-medium">{tender.contractNature}</div>
              </div>
            )}
            {tender.publicationDate && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Pubblicazione</div>
                <div className="font-medium">
                  {formatDate(tender.publicationDate)}
                </div>
              </div>
            )}
            {tender.noticeId && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Notice ID</div>
                <div className="font-mono text-xs">{tender.noticeId}</div>
              </div>
            )}
          </div>

          {/* Special features */}
          {(tender.frameworkAgreement || tender.electronicAuction) && (
            <div className="flex flex-wrap gap-2">
              {tender.frameworkAgreement && (
                <Badge variant="outline" className="text-xs">
                  <Award className="h-3 w-3 mr-1" />
                  Accordo Quadro
                </Badge>
              )}
              {tender.electronicAuction && (
                <Badge variant="outline" className="text-xs">
                  Asta Elettronica
                </Badge>
              )}
            </div>
          )}

          {/* Description */}
          {tender.description && (
            <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
              {tender.description}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            {tender.pdf &&
              tender.pdf !== "—" &&
              tender.pdf !== "null" &&
              typeof tender.pdf === "string" &&
              (tender.pdf.startsWith("http://") ||
                tender.pdf.startsWith("https://")) && (
                <Button variant="outline" size="sm" asChild className="text-xs">
                  <a
                    href={tender.pdf}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    PDF
                  </a>
                </Button>
              )}
            {onAnalyzeEligibility && (
              <AnalysisDialog
                tenderId={tender.noticeId || tender.publicationNumber}
                tenderTitle={tender.title}
                tenderData={{
                  title: tender.title,
                  buyer: tender.buyer,
                  cpv: Array.isArray(tender.cpv)
                    ? tender.cpv[0]
                    : tender.cpv || undefined,
                  deadline: tender.deadline || undefined,
                  value:
                    typeof tender.value === "number" ? tender.value : undefined,
                }}
                onAnalyze={onAnalyzeEligibility}
              >
                <Button variant="outline" size="sm" className="text-xs">
                  <Target className="h-3 w-3 mr-1" />
                  Analizza Eligibilità
                </Button>
              </AnalysisDialog>
            )}
            <Button variant="outline" size="sm" asChild className="text-xs">
              <a
                href={`https://ted.europa.eu/it/notice/-/detail/${encodeURIComponent(
                  tender.noticeId || tender.publicationNumber
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                TED Page
              </a>
            </Button>
          </div>
        </CardContent>
      )}

      {/* Expand/Collapse button */}
      <CardContent className="pt-3 border-t border-gray-100 px-4 sm:px-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setExpanded(!expanded);
            if (!expanded && !detailsLoaded) {
              setDetailsLoaded(true);
            }
          }}
          className="w-full text-xs text-gray-600"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-4 w-4 mr-1" />
              Mostra meno
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4 mr-1" />
              Mostra dettagli
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
