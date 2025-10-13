"use client";

import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Search,
  Award,
  Building2,
  Clock,
  FileText,
  Target,
} from "lucide-react";

const BASE_URL = process.env.NEXT_PUBLIC_TENDER_API_BASE ?? "";

interface FrameworkAgreement {
  publicationNumber: string;
  title: string;
  buyer: string;
  publicationDate: string;
  deadline: string;
  cpv: string;
  estimatedValue: number;
  frameworkMaxValue: number;
  contractDuration: string;
  placeOfPerformance: string;
}

const COUNTRIES = [
  { value: "ITA", label: "Italia" },
  { value: "FRA", label: "Francia" },
  { value: "DEU", label: "Germania" },
  { value: "ESP", label: "Spagna" },
  { value: "NLD", label: "Paesi Bassi" },
];

const CPV_SUGGESTIONS = [
  "72000000*", // Software
  "48000000*", // Software packages
  "73000000*", // Research and development
  "79000000*", // Business services
  "80000000*", // Education and training
  "85000000*", // Health and social work
  "90000000*", // Sewage, refuse, cleaning
];

export default function FrameworkAgreementPage() {
  const { uid, idToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<FrameworkAgreement[]>([]);
  const [query, setQuery] = useState("");

  const [filters, setFilters] = useState({
    countries: [] as string[],
    cpvCodes: [] as string[],
    daysBack: 30,
    limit: 20,
  });

  const [newCpvCode, setNewCpvCode] = useState("");

  const handleSearch = async () => {
    if (!uid || uid === "anon") {
      alert("Devi effettuare l'accesso per utilizzare la ricerca");
      return;
    }

    setLoading(true);
    try {
      const headers: HeadersInit = {
        "x-user-id": uid,
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        "Content-Type": "application/json",
      };

      const response = await fetch(`${BASE_URL}/frameworkAgreementSearch`, {
        method: "POST",
        headers,
        body: JSON.stringify(filters),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setResults(data.frameworkAgreements || []);
      setQuery(data.query || "");
    } catch (error) {
      console.error("Error searching framework agreements:", error);
      alert("Errore nella ricerca degli accordi quadro");
    } finally {
      setLoading(false);
    }
  };

  const addCpvCode = () => {
    if (newCpvCode.trim() && !filters.cpvCodes.includes(newCpvCode.trim())) {
      setFilters((prev) => ({
        ...prev,
        cpvCodes: [...prev.cpvCodes, newCpvCode.trim()],
      }));
      setNewCpvCode("");
    }
  };

  const removeCpvCode = (index: number) => {
    setFilters((prev) => ({
      ...prev,
      cpvCodes: prev.cpvCodes.filter((_, i) => i !== index),
    }));
  };

  const addCountry = (country: string) => {
    if (!filters.countries.includes(country)) {
      setFilters((prev) => ({
        ...prev,
        countries: [...prev.countries, country],
      }));
    }
  };

  const removeCountry = (index: number) => {
    setFilters((prev) => ({
      ...prev,
      countries: prev.countries.filter((_, i) => i !== index),
    }));
  };

  const formatValue = (value: number) => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
    }).format(value);
  };

  const getCountryLabel = (code: string) => {
    return COUNTRIES.find((c) => c.value === code)?.label || code;
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Accordi Quadro</h1>
        <p className="text-muted-foreground">
          Trova accordi quadro e sistemi di acquisto dinamici per opportunità a
          lungo termine.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Filters Panel */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                Filtri Accordi Quadro
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Countries */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Paesi</Label>
                <Select value="" onValueChange={addCountry}>
                  <SelectTrigger>
                    <SelectValue placeholder="Aggiungi paese" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((country) => (
                      <SelectItem key={country.value} value={country.value}>
                        {country.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap gap-2 mt-2">
                  {filters.countries.map((country, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      {getCountryLabel(country)}
                      <button
                        onClick={() => removeCountry(index)}
                        className="ml-1 hover:text-destructive"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              {/* CPV Codes */}
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  Codici CPV
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={newCpvCode}
                    onChange={(e) => setNewCpvCode(e.target.value)}
                    placeholder="Es. 72000000*"
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        addCpvCode();
                      }
                    }}
                  />
                  <Button
                    onClick={addCpvCode}
                    disabled={!newCpvCode.trim()}
                    size="sm"
                  >
                    +
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {filters.cpvCodes.map((cpv, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      {cpv}
                      <button
                        onClick={() => removeCpvCode(index)}
                        className="ml-1 hover:text-destructive"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="mt-2">
                  <Label className="text-xs text-muted-foreground">
                    Suggerimenti:
                  </Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {CPV_SUGGESTIONS.map((cpv) => (
                      <Button
                        key={cpv}
                        variant="outline"
                        size="sm"
                        className="text-xs h-6"
                        onClick={() => {
                          if (!filters.cpvCodes.includes(cpv)) {
                            setFilters((prev) => ({
                              ...prev,
                              cpvCodes: [...prev.cpvCodes, cpv],
                            }));
                          }
                        }}
                      >
                        {cpv}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Days Back */}
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  Giorni Indietro: {filters.daysBack}
                </Label>
                <Slider
                  value={[filters.daysBack]}
                  onValueChange={(value) =>
                    setFilters((prev) => ({ ...prev, daysBack: value[0] }))
                  }
                  max={90}
                  min={7}
                  step={1}
                  className="w-full"
                />
              </div>

              {/* Search Button */}
              <Button
                onClick={handleSearch}
                disabled={loading}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Ricerca in corso...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Cerca Accordi Quadro
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2">
          {query && (
            <Card className="mb-4">
              <CardContent className="p-4">
                <div className="text-sm text-muted-foreground">
                  <strong>Query generata:</strong> {query}
                </div>
              </CardContent>
            </Card>
          )}

          {results.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  Accordi Quadro Trovati ({results.length})
                </h2>
              </div>

              {results.map((agreement, index) => (
                <Card
                  key={index}
                  className="hover:shadow-md transition-shadow border-l-4 border-l-blue-500"
                >
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Award className="h-5 w-5 text-blue-600" />
                            <h3 className="text-lg font-semibold line-clamp-2">
                              {agreement.title}
                            </h3>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Building2 className="h-4 w-4" />
                            <span>{agreement.buyer}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          {agreement.estimatedValue && (
                            <div className="text-lg font-semibold text-green-600">
                              {formatValue(agreement.estimatedValue)}
                            </div>
                          )}
                          <div className="text-sm text-muted-foreground">
                            {agreement.publicationNumber}
                          </div>
                        </div>
                      </div>

                      {/* Framework Details */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <Label className="text-xs text-muted-foreground">
                            Valore Massimo
                          </Label>
                          <div className="font-medium">
                            {agreement.frameworkMaxValue
                              ? formatValue(agreement.frameworkMaxValue)
                              : "—"}
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">
                            Durata Contratto
                          </Label>
                          <div className="font-medium">
                            {agreement.contractDuration || "—"}
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">
                            Scadenza
                          </Label>
                          <div className="font-medium">
                            {agreement.deadline
                              ? new Date(agreement.deadline).toLocaleDateString(
                                  "it-IT"
                                )
                              : "—"}
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">
                            Luogo
                          </Label>
                          <div className="font-medium">
                            {agreement.placeOfPerformance || "—"}
                          </div>
                        </div>
                      </div>

                      {/* Features */}
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          variant="default"
                          className="flex items-center gap-1"
                        >
                          <Award className="h-3 w-3" />
                          Accordo Quadro
                        </Badge>
                        {agreement.cpv && (
                          <Badge variant="outline">CPV: {agreement.cpv}</Badge>
                        )}
                        <Badge
                          variant="secondary"
                          className="flex items-center gap-1"
                        >
                          <Clock className="h-3 w-3" />
                          Lungo Termine
                        </Badge>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" size="sm">
                          <FileText className="h-4 w-4 mr-1" />
                          Dettagli Completi
                        </Button>
                        <Button variant="outline" size="sm">
                          <Target className="h-4 w-4 mr-1" />
                          Analizza Opportunità
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!loading && results.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center">
                <Award className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  Nessun accordo quadro trovato
                </h3>
                <p className="text-muted-foreground">
                  Prova a modificare i filtri o ampliare la ricerca.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
