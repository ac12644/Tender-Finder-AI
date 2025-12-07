"use client";

import { useState, useEffect } from "react";
import * as React from "react";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Mail,
  Globe,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { API_BASE_URL } from "@/lib/apiConfig";

interface Application {
  id: string;
  userId: string;
  tenderId: string;
  tenderTitle: string;
  buyerName: string;
  draftContent: string;
  subject?: string;
  tone: "formal" | "professional" | "friendly" | "business";
  submissionMethod: "email" | "form" | "manual";
  recipientEmail?: string;
  submissionUrl?: string;
  submittedAt?: string;
  status:
    | "draft"
    | "sent"
    | "submitted"
    | "accepted"
    | "rejected"
    | "withdrawn";
  statusUpdatedAt?: string;
  communications: Array<{
    type: "email" | "form" | "note";
    content: string;
    sentAt: string;
    recipient?: string;
    subject?: string;
  }>;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export default function ApplicationsPage() {
  const { uid, idToken } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadApplications = React.useCallback(async () => {
    if (!uid) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const headers: HeadersInit = {
        "x-user-id": uid,
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        "Content-Type": "application/json",
      };

      const response = await fetch(`${API_BASE_URL}/getApplications`, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setApplications(data.applications || []);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Errore nel caricamento";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [uid, idToken]);

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  const getStatusColor = (status: Application["status"]) => {
    switch (status) {
      case "draft":
        return "bg-gray-100 text-gray-700 border-gray-200";
      case "sent":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "submitted":
        return "bg-yellow-100 text-yellow-700 border-yellow-200";
      case "accepted":
        return "bg-green-100 text-green-700 border-green-200";
      case "rejected":
        return "bg-red-100 text-red-700 border-red-200";
      case "withdrawn":
        return "bg-gray-100 text-gray-700 border-gray-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const getStatusIcon = (status: Application["status"]) => {
    switch (status) {
      case "draft":
        return <FileText className="h-4 w-4" />;
      case "sent":
        return <Mail className="h-4 w-4" />;
      case "submitted":
        return <Clock className="h-4 w-4" />;
      case "accepted":
        return <CheckCircle className="h-4 w-4" />;
      case "rejected":
        return <XCircle className="h-4 w-4" />;
      case "withdrawn":
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  if (!uid) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">
              Please sign in to view your applications.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">Loading applications...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 mb-4">{error}</p>
            <Button onClick={loadApplications}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Application Board
          </h1>
          <p className="text-gray-600">
            Track all your tender applications in one place
          </p>
        </div>

        {/* Applications List */}
        {applications.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No applications yet
              </h3>
              <p className="text-gray-600 mb-4">
                Start applying to tenders to see them here.
              </p>
              <Button asChild>
                <Link href="/">Browse Tenders</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {applications.map((app) => (
              <Card key={app.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl mb-2">
                        {app.tenderTitle}
                      </CardTitle>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <FileText className="h-4 w-4" />
                          {app.buyerName}
                        </span>
                        {app.submittedAt && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {new Date(app.submittedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge className={getStatusColor(app.status)}>
                      <span className="flex items-center gap-1">
                        {getStatusIcon(app.status)}
                        {app.status.charAt(0).toUpperCase() +
                          app.status.slice(1)}
                      </span>
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Application Details */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">
                          Submission Method:
                        </span>
                        <span className="ml-2 font-medium capitalize">
                          {app.submissionMethod}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Tone:</span>
                        <span className="ml-2 font-medium capitalize">
                          {app.tone}
                        </span>
                      </div>
                      {app.recipientEmail && (
                        <div>
                          <span className="text-gray-600">Recipient:</span>
                          <span className="ml-2 font-medium">
                            {app.recipientEmail}
                          </span>
                        </div>
                      )}
                      {app.submissionUrl && (
                        <div>
                          <span className="text-gray-600">Submission URL:</span>
                          <a
                            href={app.submissionUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 font-medium text-blue-600 hover:underline flex items-center gap-1"
                          >
                            View <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Communication History */}
                    {app.communications && app.communications.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">
                          Communication History
                        </h4>
                        <div className="space-y-2">
                          {app.communications.map((comm, idx) => (
                            <div
                              key={idx}
                              className="p-3 bg-gray-50 rounded border border-gray-200"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  {comm.type === "email" ? (
                                    <Mail className="h-4 w-4 text-blue-500" />
                                  ) : comm.type === "form" ? (
                                    <Globe className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <FileText className="h-4 w-4 text-gray-500" />
                                  )}
                                  <span className="text-sm font-medium capitalize">
                                    {comm.type}
                                  </span>
                                  {comm.subject && (
                                    <span className="text-sm text-gray-600">
                                      - {comm.subject}
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-gray-500">
                                  {new Date(comm.sentAt).toLocaleString()}
                                </span>
                              </div>
                              {comm.recipient && (
                                <div className="text-xs text-gray-600">
                                  To: {comm.recipient}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Draft Content Preview */}
                    {app.draftContent && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">
                          Draft Content
                        </h4>
                        <div className="p-3 bg-gray-50 rounded border border-gray-200 max-h-40 overflow-y-auto">
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">
                            {app.draftContent.substring(0, 300)}
                            {app.draftContent.length > 300 && "..."}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          window.open(
                            `https://ted.europa.eu/udl?uri=TED:NOTICE:${app.tenderId}:TEXT:IT:HTML`,
                            "_blank"
                          );
                        }}
                      >
                        View Tender <ExternalLink className="h-3 w-3 ml-1" />
                      </Button>
                      {app.status === "draft" && (
                        <Button variant="default" size="sm">
                          Continue Application
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
