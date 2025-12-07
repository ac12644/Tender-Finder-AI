"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  Users,
  Search,
  AlertTriangle,
  Wrench,
  Loader2,
} from "lucide-react";
import { API_BASE_URL } from "@/lib/apiConfig";
import { useAuth } from "@/components/AuthProvider";

interface AdminMetrics {
  period: {
    start: string;
    end: string;
    days: number;
  };
  metrics: {
    agents: {
      totalExecutions: number;
      byAgent: Record<
        string,
        {
          count: number;
          totalLatency: number;
          errors: number;
          averageLatency: number;
        }
      >;
      byIntent: Record<string, number>;
      averageLatency: number;
      errorRate: number;
      totalErrors: number;
    };
    users: {
      totalUsers: number;
      totalSessions: number;
      anonymousSessions: number;
      topUsers: Array<{ userId: string; count: number }>;
      averageSessionsPerUser: number;
    };
    search: {
      totalSearches: number;
      averageLatency: number;
      toolCalls: Record<string, number>;
      averageResultsPerSearch: number;
      totalResults: number;
    };
    errors: {
      totalErrors: number;
      byAgent: Record<string, number>;
      byType: Record<string, number>;
      recentErrors: Array<{
        id: string;
        type: string;
        message: string;
        timestamp: string;
      }>;
    };
    tools: {
      totalToolCalls: number;
      byTool: Array<{
        name: string;
        count: number;
        averageLatency: number;
      }>;
    };
    tenders: {
      totalSearches: number;
      estimatedTendersFound: number;
    };
    health: {
      healthScore: number;
      errorRate: number;
      averageLatency: number;
      totalExecutions: number;
      totalErrors: number;
      uptime: string;
    };
  };
  timestamp: string;
}

const ADMIN_UID =
  process.env.NEXT_PUBLIC_ADMIN_UID || "4s418LqX8UM1fmo9KhAw56QrINn1";

export default function AdminMetricsPage() {
  const { uid, idToken } = useAuth();
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("7d");

  useEffect(() => {
    if (uid === ADMIN_UID) {
      loadMetrics();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, uid, idToken]);

  // Helper function to format latency from milliseconds to minutes
  function formatLatency(ms: number): string {
    if (ms === 0 || !ms) return "0 min";
    const minutes = ms / (1000 * 60);
    if (minutes < 1) {
      const seconds = ms / 1000;
      return seconds < 1 ? "< 1 sec" : `${seconds.toFixed(1)} sec`;
    }
    if (minutes < 60) {
      return `${minutes.toFixed(2)} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = (minutes % 60).toFixed(2);
    return `${hours}h ${remainingMinutes} min`;
  }

  async function loadMetrics() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${API_BASE_URL}/getAdminMetrics?period=${period}`,
        {
          headers: {
            "x-user-id": uid ?? "anon",
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }

  const getHealthColor = (score: number) => {
    if (score >= 95) return "text-green-600";
    if (score >= 80) return "text-yellow-600";
    return "text-red-600";
  };

  const getUptimeColor = (uptime: string) => {
    switch (uptime) {
      case "healthy":
        return "bg-green-100 text-green-700 border-green-200";
      case "degraded":
        return "bg-yellow-100 text-yellow-700 border-yellow-200";
      default:
        return "bg-red-100 text-red-700 border-red-200";
    }
  };

  // Check if user is admin
  if (!uid || uid !== ADMIN_UID) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">
              You do not have permission to access this page. This page is
              restricted to administrators only.
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
          <p className="text-gray-600">Loading metrics...</p>
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
            <Button onClick={loadMetrics}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!metrics) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Admin Metrics Dashboard
          </h1>
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              {["7d", "30d", "90d"].map((p) => (
                <Button
                  key={p}
                  variant={period === p ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPeriod(p)}
                >
                  {p}
                </Button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={loadMetrics}>
              Refresh
            </Button>
            <span className="text-sm text-gray-500">
              {new Date(metrics.period.start).toLocaleDateString()} -{" "}
              {new Date(metrics.period.end).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* System Health Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">
                Health Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`text-3xl font-bold ${getHealthColor(
                  metrics.metrics.health.healthScore
                )}`}
              >
                {metrics.metrics.health.healthScore.toFixed(1)}%
              </div>
              <Badge
                className={`mt-2 ${getUptimeColor(
                  metrics.metrics.health.uptime
                )}`}
              >
                {metrics.metrics.health.uptime}
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Total Executions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">
                {metrics.metrics.health.totalExecutions.toLocaleString()}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Avg latency:{" "}
                {formatLatency(metrics.metrics.health.averageLatency)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Active Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">
                {metrics.metrics.users.totalUsers}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {metrics.metrics.users.totalSessions} sessions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <Search className="h-4 w-4" />
                Searches
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">
                {metrics.metrics.search.totalSearches}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {metrics.metrics.tenders.estimatedTendersFound} tenders found
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Agent Performance */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Agent Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(metrics.metrics.agents.byAgent).map(
                ([agentId, data]) => (
                  <div
                    key={agentId}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 capitalize">
                        {agentId.replace("_", " ")}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        {data.count} executions
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-gray-900">
                        {formatLatency(data.averageLatency)}
                      </div>
                      <div className="text-sm text-gray-600">avg latency</div>
                    </div>
                    <div className="text-right ml-8">
                      <div className="text-lg font-semibold text-red-600">
                        {data.errors}
                      </div>
                      <div className="text-sm text-gray-600">errors</div>
                    </div>
                  </div>
                )
              )}
            </div>
          </CardContent>
        </Card>

        {/* Search Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Search Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Searches</span>
                <span className="font-semibold">
                  {metrics.metrics.search.totalSearches}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Avg Latency</span>
                <span className="font-semibold">
                  {formatLatency(metrics.metrics.search.averageLatency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Avg Results/Search</span>
                <span className="font-semibold">
                  {metrics.metrics.search.averageResultsPerSearch.toFixed(1)}
                </span>
              </div>
              <div className="pt-4 border-t">
                <div className="text-sm font-medium text-gray-700 mb-2">
                  Tool Usage
                </div>
                {Object.entries(metrics.metrics.search.toolCalls).map(
                  ([tool, count]) => (
                    <div key={tool} className="flex justify-between text-sm">
                      <span className="text-gray-600">{tool}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                  )
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5" />
                Tool Usage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {metrics.metrics.tools.byTool.map((tool) => (
                  <div
                    key={tool.name}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded"
                  >
                    <div>
                      <div className="font-medium text-gray-900">
                        {tool.name}
                      </div>
                      <div className="text-sm text-gray-600">
                        {formatLatency(tool.averageLatency)} avg
                      </div>
                    </div>
                    <Badge variant="outline">{tool.count}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Error Metrics */}
        {metrics.metrics.errors.totalErrors > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Errors ({metrics.metrics.errors.totalErrors})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">
                    By Agent
                  </div>
                  {Object.entries(metrics.metrics.errors.byAgent).map(
                    ([agent, count]) => (
                      <div key={agent} className="flex justify-between text-sm">
                        <span className="text-gray-600">{agent}</span>
                        <span className="font-medium text-red-600">
                          {count}
                        </span>
                      </div>
                    )
                  )}
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">
                    By Type
                  </div>
                  {Object.entries(metrics.metrics.errors.byType).map(
                    ([type, count]) => (
                      <div key={type} className="flex justify-between text-sm">
                        <span className="text-gray-600">{type}</span>
                        <span className="font-medium text-red-600">
                          {count}
                        </span>
                      </div>
                    )
                  )}
                </div>
              </div>
              {metrics.metrics.errors.recentErrors.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">
                    Recent Errors
                  </div>
                  <div className="space-y-2">
                    {metrics.metrics.errors.recentErrors
                      .slice(0, 5)
                      .map((err) => (
                        <div
                          key={err.id}
                          className="p-3 bg-red-50 border border-red-200 rounded text-sm"
                        >
                          <div className="font-medium text-red-900">
                            {err.type}
                          </div>
                          <div className="text-red-700 mt-1">{err.message}</div>
                          <div className="text-xs text-red-600 mt-1">
                            {new Date(err.timestamp).toLocaleString()}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Top Users */}
        {metrics.metrics.users.topUsers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Top Active Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {metrics.metrics.users.topUsers.map((user, idx) => (
                  <div
                    key={user.userId}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">
                        {idx + 1}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">
                          {user.userId.substring(0, 20)}...
                        </div>
                        <div className="text-sm text-gray-600">
                          {user.count} sessions
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
