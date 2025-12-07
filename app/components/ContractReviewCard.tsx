"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  HelpCircle,
  TrendingUp,
} from "lucide-react";

interface ContractReview {
  summary?: string;
  keyClauses?: Array<{
    type: string;
    description: string;
    relevance: "high" | "medium" | "low";
    chunkIndex?: number;
  }>;
  risks?: Array<{
    severity: "high" | "medium" | "low";
    description: string;
    recommendation: string;
  }>;
  opportunities?: Array<{
    type: "advantage" | "flexibility" | "benefit";
    description: string;
  }>;
  questions?: Array<{
    question: string;
    priority: "high" | "medium" | "low";
    reason: string;
  }>;
  overallAssessment?: {
    riskLevel: "high" | "medium" | "low";
    recommendation:
      | "proceed"
      | "proceed_with_caution"
      | "review_carefully"
      | "do_not_proceed";
    reasoning: string;
  };
  complianceCheck?: {
    italianLaw: "compliant" | "potential_issues" | "non_compliant" | "unclear";
    issues?: string[];
  };
}

interface ContractReviewCardProps {
  review: ContractReview;
  contractId?: string;
}

export function ContractReviewCard({ review }: ContractReviewCardProps) {
  const getRiskColor = (severity: string) => {
    switch (severity) {
      case "high":
        return "bg-red-100 text-red-800 border-red-200";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "low":
        return "bg-blue-100 text-blue-800 border-blue-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getRecommendationColor = (rec: string) => {
    switch (rec) {
      case "proceed":
        return "bg-green-100 text-green-800 border-green-200";
      case "proceed_with_caution":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "review_carefully":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "do_not_proceed":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getRecommendationLabel = (rec: string) => {
    switch (rec) {
      case "proceed":
        return "Procedere";
      case "proceed_with_caution":
        return "Procedere con cautela";
      case "review_carefully":
        return "Rivedere attentamente";
      case "do_not_proceed":
        return "Non procedere";
      default:
        return rec;
    }
  };

  const getComplianceColor = (status: string) => {
    switch (status) {
      case "compliant":
        return "bg-green-100 text-green-800 border-green-200";
      case "potential_issues":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "non_compliant":
        return "bg-red-100 text-red-800 border-red-200";
      case "unclear":
        return "bg-gray-100 text-gray-800 border-gray-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getComplianceLabel = (status: string) => {
    switch (status) {
      case "compliant":
        return "Conforme";
      case "potential_issues":
        return "Problemi potenziali";
      case "non_compliant":
        return "Non conforme";
      case "unclear":
        return "Non chiaro";
      default:
        return status;
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      {review.summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Riepilogo Contratto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 leading-relaxed">
              {review.summary}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Overall Assessment */}
      {review.overallAssessment && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Valutazione Generale
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Badge
                className={`${getRiskColor(
                  review.overallAssessment.riskLevel
                )} border`}
              >
                Rischio: {review.overallAssessment.riskLevel}
              </Badge>
              <Badge
                className={`${getRecommendationColor(
                  review.overallAssessment.recommendation
                )} border`}
              >
                {getRecommendationLabel(
                  review.overallAssessment.recommendation
                )}
              </Badge>
            </div>
            <p className="text-sm text-gray-700">
              {review.overallAssessment.reasoning}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Compliance Check */}
      {review.complianceCheck && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              Conformità Legale
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Badge
              className={`${getComplianceColor(
                review.complianceCheck.italianLaw
              )} border`}
            >
              {getComplianceLabel(review.complianceCheck.italianLaw)}
            </Badge>
            {review.complianceCheck.issues &&
              review.complianceCheck.issues.length > 0 && (
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
                  {review.complianceCheck.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              )}
          </CardContent>
        </Card>
      )}

      {/* Key Clauses */}
      {review.keyClauses && review.keyClauses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Clausole Chiave
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {review.keyClauses.map((clause, i) => (
                <div
                  key={i}
                  className="border-l-4 border-blue-200 pl-4 py-2 bg-blue-50 rounded-r"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-600 uppercase">
                      {clause.type}
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        clause.relevance === "high"
                          ? "border-red-300 text-red-700"
                          : clause.relevance === "medium"
                          ? "border-yellow-300 text-yellow-700"
                          : "border-gray-300 text-gray-700"
                      }
                    >
                      {clause.relevance}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-700">{clause.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Risks */}
      {review.risks && review.risks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Rischi Identificati
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {review.risks.map((risk, i) => (
                <div
                  key={i}
                  className={`border-l-4 ${
                    risk.severity === "high"
                      ? "border-red-500 bg-red-50"
                      : risk.severity === "medium"
                      ? "border-yellow-500 bg-yellow-50"
                      : "border-blue-500 bg-blue-50"
                  } pl-4 py-3 rounded-r`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={`${getRiskColor(risk.severity)} border`}>
                      {risk.severity}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-800 mb-2">
                    {risk.description}
                  </p>
                  <p className="text-xs text-gray-600 italic">
                    💡 {risk.recommendation}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Opportunities */}
      {review.opportunities && review.opportunities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              Opportunità
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {review.opportunities.map((opp, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded"
                >
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="text-xs font-medium text-green-800 uppercase">
                      {opp.type}
                    </span>
                    <p className="text-sm text-gray-700 mt-1">
                      {opp.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Questions */}
      {review.questions && review.questions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <HelpCircle className="h-5 w-5" />
              Domande da Porre
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {review.questions.map((q, i) => (
                <div
                  key={i}
                  className="border-l-4 border-purple-200 pl-4 py-2 bg-purple-50 rounded-r"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      variant="outline"
                      className={
                        q.priority === "high"
                          ? "border-red-300 text-red-700"
                          : q.priority === "medium"
                          ? "border-yellow-300 text-yellow-700"
                          : "border-gray-300 text-gray-700"
                      }
                    >
                      {q.priority}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium text-gray-800 mb-1">
                    {q.question}
                  </p>
                  <p className="text-xs text-gray-600">{q.reason}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
