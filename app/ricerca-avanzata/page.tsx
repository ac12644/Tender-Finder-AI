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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Search,
  Filter,
  Building2,
  Award,
  Users,
  FileText,
  Zap,
  Target,
} from "lucide-react";

import { API_BASE_URL } from "@/lib/apiConfig";
const BASE_URL = API_BASE_URL;

interface AdvancedSearchFilters {
  procedureType?: string;
  contractNature?: string;
  frameworkAgreement?: boolean;
  electronicAuction?: boolean;
  subcontractingAllowed?: boolean;
  minValue?: number;
  maxValue?: number;
  countries?: string[];
  cities?: string[];
  cpvCodes?: string[];
  daysBack: number;
  limit: number;
}

interface TenderResult {
  publicationNumber: string;
  noticeId: string;
  title: string;
  buyer: string;
  publicationDate: string;
  deadline: string;
  cpv: string;
  estimatedValue: number;
  procedureType: string;
  contractNature: string;
  frameworkAgreement: boolean;
  electronicAuction: boolean;
  subcontractingAllowed: boolean;
  placeOfPerformance: string;
  country: string;
  city: string;
}

const PROCEDURE_TYPES = [
  { value: "open", label: "Procedura Aperta" },
  { value: "restricted", label: "Procedura Ristretta" },
  { value: "negotiated", label: "Procedura Negoziale" },
  { value: "competitive-dialogue", label: "Dialogo Competitivo" },
  { value: "innovation-partnership", label: "Partenariato per l'Innovazione" },
  { value: "framework-agreement", label: "Accordo Quadro" },
];

const CONTRACT_NATURES = [
  { value: "services", label: "Servizi" },
  { value: "supplies", label: "Forniture" },
  { value: "works", label: "Lavori" },
  { value: "services-and-supplies", label: "Servizi e Forniture" },
  { value: "works-and-services", label: "Lavori e Servizi" },
];

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

export default function AdvancedSearchPage() {
  const { uid, idToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TenderResult[]>([]);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<AdvancedSearchFilters>({
    daysBack: 7,
    limit: 20,
  });

  const [newCpvCode, setNewCpvCode] = useState("");
  const [newCity, setNewCity] = useState("");

  const handleSearch = async () => {
    if (!uid || uid === "anon") {
      alert("Devi effettuare l'accesso per utilizzare la ricerca avanzata");
      return;
    }

    setLoading(true);
    try {
      const headers: HeadersInit = {
        "x-user-id": uid,
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        "Content-Type": "application/json",
      };

      const response = await fetch(`${BASE_URL}/advancedSearch`, {
        method: "POST",
        headers,
        body: JSON.stringify(filters),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setResults(data.tenders || []);
      setQuery(data.query || "");
    } catch (error) {
      console.error("Error in advanced search:", error);
      alert("Errore nella ricerca avanzata");
    } finally {
      setLoading(false);
    }
  };

  const addCpvCode = () => {
    if (newCpvCode.trim() && !filters.cpvCodes?.includes(newCpvCode.trim())) {
      setFilters((prev) => ({
        ...prev,
        cpvCodes: [...(prev.cpvCodes || []), newCpvCode.trim()],
      }));
      setNewCpvCode("");
    }
  };

  const removeCpvCode = (index: number) => {
    setFilters((prev) => ({
      ...prev,
      cpvCodes: prev.cpvCodes?.filter((_, i) => i !== index) || [],
    }));
  };

  const addCity = () => {
    if (newCity.trim() && !filters.cities?.includes(newCity.trim())) {
      setFilters((prev) => ({
        ...prev,
        cities: [...(prev.cities || []), newCity.trim()],
      }));
      setNewCity("");
    }
  };

  const removeCity = (index: number) => {
    setFilters((prev) => ({
      ...prev,
      cities: prev.cities?.filter((_, i) => i !== index) || [],
    }));
  };

  const formatValue = (value: number) => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
    }).format(value);
  };

  const getProcedureTypeLabel = (type: string) => {
    return PROCEDURE_TYPES.find((p) => p.value === type)?.label || type;
  };

  const getContractNatureLabel = (nature: string) => {
    return CONTRACT_NATURES.find((c) => c.value === nature)?.label || nature;
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Ricerca Avanzata</h1>
        <p className="text-muted-foreground">
          Utilizza i filtri avanzati per trovare bandi specifici con precisione.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Filters Panel */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filtri di Ricerca
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Procedure Type */}
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  Tipo di Procedura
                </Label>
                <Select
                  value={filters.procedureType || ""}
                  onValueChange={(value) =>
                    setFilters((prev) => ({ ...prev, procedureType: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona tipo procedura" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROCEDURE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Contract Nature */}
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  Natura del Contratto
                </Label>
                <Select
                  value={filters.contractNature || ""}
                  onValueChange={(value) =>
                    setFilters((prev) => ({ ...prev, contractNature: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona natura contratto" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTRACT_NATURES.map((nature) => (
                      <SelectItem key={nature.value} value={nature.value}>
                        {nature.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Special Features */}
              <div className="space-y-4">
                <Label className="text-sm font-medium">
                  Caratteristiche Speciali
                </Label>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="framework-agreement"
                    checked={filters.frameworkAgreement || false}
                    onCheckedChange={(checked) =>
                      setFilters((prev) => ({
                        ...prev,
                        frameworkAgreement: checked,
                      }))
                    }
                  />
                  <Label htmlFor="framework-agreement" className="text-sm">
                    Solo Accordi Quadro
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="electronic-auction"
                    checked={filters.electronicAuction || false}
                    onCheckedChange={(checked) =>
                      setFilters((prev) => ({
                        ...prev,
                        electronicAuction: checked,
                      }))
                    }
                  />
                  <Label htmlFor="electronic-auction" className="text-sm">
                    Solo Aste Elettroniche
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="subcontracting"
                    checked={filters.subcontractingAllowed || false}
                    onCheckedChange={(checked) =>
                      setFilters((prev) => ({
                        ...prev,
                        subcontractingAllowed: checked,
                      }))
                    }
                  />
                  <Label htmlFor="subcontracting" className="text-sm">
                    Subappalto Consentito
                  </Label>
                </div>
              </div>

              {/* Value Range */}
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  Valore Contratto (€)
                </Label>
                <div className="space-y-2">
                  <Input
                    type="number"
                    placeholder="Valore minimo"
                    value={filters.minValue || ""}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        minValue: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      }))
                    }
                  />
                  <Input
                    type="number"
                    placeholder="Valore massimo"
                    value={filters.maxValue || ""}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        maxValue: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      }))
                    }
                  />
                </div>
              </div>

              {/* Countries */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Paesi</Label>
                <Select
                  value=""
                  onValueChange={(value) => {
                    if (!filters.countries?.includes(value)) {
                      setFilters((prev) => ({
                        ...prev,
                        countries: [...(prev.countries || []), value],
                      }));
                    }
                  }}
                >
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
                  {(filters.countries || []).map((country, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      {COUNTRIES.find((c) => c.value === country)?.label ||
                        country}
                      <button
                        onClick={() =>
                          setFilters((prev) => ({
                            ...prev,
                            countries:
                              prev.countries?.filter((_, i) => i !== index) ||
                              [],
                          }))
                        }
                        className="ml-1 hover:text-destructive"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Cities */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Città</Label>
                <div className="flex gap-2">
                  <Input
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    placeholder="Es. Milano, Roma"
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        addCity();
                      }
                    }}
                  />
                  <Button
                    onClick={addCity}
                    disabled={!newCity.trim()}
                    size="sm"
                  >
                    +
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {(filters.cities || []).map((city, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      {city}
                      <button
                        onClick={() => removeCity(index)}
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
                  {(filters.cpvCodes || []).map((cpv, index) => (
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
                          if (!filters.cpvCodes?.includes(cpv)) {
                            setFilters((prev) => ({
                              ...prev,
                              cpvCodes: [...(prev.cpvCodes || []), cpv],
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
                  max={30}
                  min={1}
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
                    Cerca Bandi
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
                  Risultati ({results.length})
                </h2>
              </div>

              {results.map((tender, index) => (
                <Card key={index} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold mb-2 line-clamp-2">
                            {tender.title}
                          </h3>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
                          <div className="text-sm text-muted-foreground">
                            {tender.publicationNumber}
                          </div>
                        </div>
                      </div>

                      {/* Details */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <Label className="text-xs text-muted-foreground">
                            Procedura
                          </Label>
                          <div className="font-medium">
                            {getProcedureTypeLabel(tender.procedureType)}
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">
                            Natura
                          </Label>
                          <div className="font-medium">
                            {getContractNatureLabel(tender.contractNature)}
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">
                            Scadenza
                          </Label>
                          <div className="font-medium">
                            {tender.deadline
                              ? new Date(tender.deadline).toLocaleDateString(
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
                            {tender.city || tender.country || "—"}
                          </div>
                        </div>
                      </div>

                      {/* Features */}
                      <div className="flex flex-wrap gap-2">
                        {tender.frameworkAgreement && (
                          <Badge
                            variant="secondary"
                            className="flex items-center gap-1"
                          >
                            <Award className="h-3 w-3" />
                            Accordo Quadro
                          </Badge>
                        )}
                        {tender.electronicAuction && (
                          <Badge
                            variant="secondary"
                            className="flex items-center gap-1"
                          >
                            <Zap className="h-3 w-3" />
                            Asta Elettronica
                          </Badge>
                        )}
                        {tender.subcontractingAllowed && (
                          <Badge
                            variant="secondary"
                            className="flex items-center gap-1"
                          >
                            <Users className="h-3 w-3" />
                            Subappalto
                          </Badge>
                        )}
                        {tender.cpv && (
                          <Badge variant="outline">CPV: {tender.cpv}</Badge>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" size="sm">
                          <FileText className="h-4 w-4 mr-1" />
                          Dettagli
                        </Button>
                        <Button variant="outline" size="sm">
                          <Target className="h-4 w-4 mr-1" />
                          Analizza Eligibilità
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
                <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  Nessun risultato trovato
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
