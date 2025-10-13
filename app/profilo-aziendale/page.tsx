"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Building2, MapPin, Target, AlertCircle, Check } from "lucide-react";
import { IT_REGIONS, CPV_SUGGESTIONS } from "@/data";

const BASE_URL = process.env.NEXT_PUBLIC_TENDER_API_BASE ?? "";

interface CompanyProfile {
  uid: string;
  companyName: string;
  legalForm?: string;
  annualRevenue?: number;
  employeeCount?: number;
  yearsInBusiness?: number;
  certifications: string[];
  technicalSkills: string[];
  operatingRegions: string[];
  primarySectors: string[];
  cpvCodes: string[];
  competitionTolerance: "low" | "medium" | "high";
  // Preferences
  daysBack: number;
  minValue?: number;
  notifyDaily: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const LEGAL_FORMS = [
  "SRL",
  "SPA",
  "SNC",
  "SAS",
  "SS",
  "Consorzio",
  "Cooperativa",
  "Altro",
];

const COMPETITION_LEVELS = [
  { value: "low", label: "Bassa" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
];

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
          ? "bg-blue-500 text-white border-blue-500"
          : "bg-white hover:bg-gray-50 border-gray-300",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export default function CompanyProfilePage() {
  const { uid, idToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<Partial<CompanyProfile>>({
    companyName: "",
    legalForm: "",
    annualRevenue: undefined,
    employeeCount: undefined,
    yearsInBusiness: undefined,
    certifications: [],
    technicalSkills: [],
    operatingRegions: [],
    primarySectors: [],
    cpvCodes: [],
    competitionTolerance: "medium",
    daysBack: 7,
    minValue: undefined,
    notifyDaily: false,
  });

  const [newSkill, setNewSkill] = useState("");

  const loadProfile = useCallback(async () => {
    try {
      const headers: HeadersInit = {
        "x-user-id": uid ?? "anon",
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        "Content-Type": "application/json",
      };

      const response = await fetch(`${BASE_URL}/getCompanyProfile`, {
        method: "GET",
        headers,
      });

      if (response.ok) {
        const profileData = await response.json();
        setFormData({
          ...profileData,
          daysBack: profileData.daysBack || 7,
          minValue: profileData.minValue || undefined,
          notifyDaily: profileData.notifyDaily || false,
        });
      } else if (response.status === 404) {
        // Profile doesn't exist yet
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error("Error loading profile:", error);
      setError("Errore nel caricamento del profilo");
    } finally {
      setLoading(false);
    }
  }, [uid, idToken]);

  useEffect(() => {
    if (uid && uid !== "anon") {
      loadProfile();
    } else {
      setLoading(false);
    }
  }, [uid, loadProfile]);

  const saveProfile = async () => {
    if (!formData.companyName?.trim()) {
      setError("Il nome dell'azienda è obbligatorio");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const headers: HeadersInit = {
        "x-user-id": uid ?? "anon",
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        "Content-Type": "application/json",
      };

      // Save company profile
      const profileResponse = await fetch(`${BASE_URL}/upsertCompanyProfile`, {
        method: "POST",
        headers,
        body: JSON.stringify(formData),
      });

      if (!profileResponse.ok) {
        throw new Error(`HTTP ${profileResponse.status}`);
      }

      // Save preferences
      const prefsResponse = await fetch(`${BASE_URL}/preferences`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          regions: formData.operatingRegions || [],
          cpv: formData.cpvCodes || [],
          daysBack: formData.daysBack || 7,
          minValue: formData.minValue || null,
          sectors: formData.primarySectors || [],
          notifyDaily: formData.notifyDaily || false,
        }),
      });

      if (!prefsResponse.ok) {
        throw new Error(`HTTP ${prefsResponse.status}`);
      }

      await profileResponse.json();
      setError(null);
    } catch (error) {
      console.error("Error saving profile:", error);
      setError("Errore nel salvataggio del profilo");
    } finally {
      setSaving(false);
    }
  };

  const addToArray = (field: keyof CompanyProfile, value: string) => {
    if (!value.trim()) return;

    setFormData((prev) => ({
      ...prev,
      [field]: [...((prev[field] as string[]) || []), value.trim()],
    }));
  };

  const removeFromArray = (field: keyof CompanyProfile, index: number) => {
    setFormData((prev) => ({
      ...prev,
      [field]: ((prev[field] as string[]) || []).filter((_, i) => i !== index),
    }));
  };

  const toggleRegion = (region: string) => {
    setFormData((prev) => ({
      ...prev,
      operatingRegions: prev.operatingRegions?.includes(region)
        ? prev.operatingRegions.filter((r) => r !== region)
        : [...(prev.operatingRegions || []), region],
    }));
  };

  const toggleCpv = (code: string) => {
    setFormData((prev) => ({
      ...prev,
      cpvCodes: prev.cpvCodes?.includes(code)
        ? prev.cpvCodes.filter((c) => c !== code)
        : [...(prev.cpvCodes || []), code],
    }));
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-500">Caricamento profilo...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!uid || uid === "anon") {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Accesso Richiesto</h2>
            <p className="text-gray-500">
              Devi effettuare l&apos;accesso per gestire il profilo aziendale.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 text-gray-900">
          Profilo Aziendale
        </h1>
        <p className="text-gray-600">
          Completa il tuo profilo per ricevere suggerimenti personalizzati sui
          bandi più adatti alla tua azienda.
        </p>
      </div>

      {error && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardContent className="p-4">
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        {/* Company Basic Info */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900">
              <Building2 className="h-5 w-5 text-blue-500" />
              Informazioni Azienda
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block text-gray-700">
                  Nome Azienda *
                </label>
                <Input
                  value={formData.companyName || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      companyName: e.target.value,
                    }))
                  }
                  placeholder="Es. Acme SRL"
                  className="border-gray-300 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block text-gray-700">
                  Forma Giuridica
                </label>
                <Select
                  value={formData.legalForm || ""}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, legalForm: value }))
                  }
                >
                  <SelectTrigger className="border-gray-300 focus:border-blue-500">
                    <SelectValue placeholder="Seleziona forma giuridica" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEGAL_FORMS.map((form) => (
                      <SelectItem key={form} value={form}>
                        {form}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block text-gray-700">
                  Fatturato Annuo (€)
                </label>
                <Input
                  type="number"
                  value={formData.annualRevenue || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      annualRevenue: Number(e.target.value),
                    }))
                  }
                  placeholder="1000000"
                  className="border-gray-300 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block text-gray-700">
                  Numero Dipendenti
                </label>
                <Input
                  type="number"
                  value={formData.employeeCount || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      employeeCount: Number(e.target.value),
                    }))
                  }
                  placeholder="50"
                  className="border-gray-300 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block text-gray-700">
                  Anni di Attività
                </label>
                <Input
                  type="number"
                  value={formData.yearsInBusiness || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      yearsInBusiness: Number(e.target.value),
                    }))
                  }
                  placeholder="5"
                  className="border-gray-300 focus:border-blue-500"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Operating Regions */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900">
              <MapPin className="h-5 w-5 text-blue-500" />
              Regioni di Operatività
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              Seleziona le regioni italiane dove operi (opzionale).
            </p>
            <div className="flex flex-wrap gap-2">
              {IT_REGIONS.map((region) => (
                <Chip
                  key={region}
                  active={formData.operatingRegions?.includes(region)}
                  onClick={() => toggleRegion(region)}
                >
                  {region}
                </Chip>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Technical Skills */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900">
              <Target className="h-5 w-5 text-blue-500" />
              Competenze Tecniche
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                placeholder="Es. Sviluppo Software, Consulenza IT"
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    addToArray("technicalSkills", newSkill);
                    setNewSkill("");
                  }
                }}
                className="border-gray-300 focus:border-blue-500"
              />
              <Button
                onClick={() => {
                  addToArray("technicalSkills", newSkill);
                  setNewSkill("");
                }}
                disabled={!newSkill.trim()}
                className="bg-blue-500 hover:bg-blue-600"
              >
                Aggiungi
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(formData.technicalSkills || []).map((skill, index) => (
                <Badge
                  key={index}
                  variant="secondary"
                  className="flex items-center gap-1 bg-gray-100 text-gray-700"
                >
                  {skill}
                  <button
                    onClick={() => removeFromArray("technicalSkills", index)}
                    className="ml-1 hover:text-red-500"
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* CPV Codes */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900">
              <Target className="h-5 w-5 text-blue-500" />
              Settori di Interesse (CPV)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              Seleziona i settori che ti interessano (massimo 10).
            </p>
            <div className="flex flex-wrap gap-2">
              {CPV_SUGGESTIONS.slice(0, 20).map((cpv) => (
                <Chip
                  key={cpv.code}
                  active={formData.cpvCodes?.includes(cpv.code)}
                  onClick={() => toggleCpv(cpv.code)}
                >
                  {cpv.label}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {(formData.cpvCodes || []).map((code, index) => (
                <Badge
                  key={index}
                  variant="secondary"
                  className="flex items-center gap-1 bg-blue-100 text-blue-700"
                >
                  {code}
                  <button
                    onClick={() => removeFromArray("cpvCodes", index)}
                    className="ml-1 hover:text-red-500"
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Competition Tolerance */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-900">
              <Target className="h-5 w-5 text-blue-500" />
              Tolleranza alla Concorrenza
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              value={formData.competitionTolerance || "medium"}
              onValueChange={(value: "low" | "medium" | "high") =>
                setFormData((prev) => ({
                  ...prev,
                  competitionTolerance: value,
                }))
              }
            >
              <SelectTrigger className="border-gray-300 focus:border-blue-500">
                <SelectValue placeholder="Seleziona livello di concorrenza" />
              </SelectTrigger>
              <SelectContent>
                {COMPETITION_LEVELS.map((level) => (
                  <SelectItem key={level.value} value={level.value}>
                    {level.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            onClick={saveProfile}
            disabled={saving || !formData.companyName?.trim()}
            className="px-8 bg-blue-500 hover:bg-blue-600 text-white"
          >
            {saving ? (
              "Salvataggio..."
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Salva Profilo
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
