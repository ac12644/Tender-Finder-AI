import { onRequest } from "firebase-functions/v2/https";
import { db } from "./lib/firestore";
import type { CompanyProfile } from "./lib/models";

function setCors(res: { set: (key: string, value: string) => void }) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// Get company profile
export const getCompanyProfile = onRequest(
  { region: "europe-west1", cors: true, timeoutSeconds: 30 },
  async (req, res): Promise<void> => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    try {
      const userId = req.headers["x-user-id"] as string;

      if (!userId || userId === "anon") {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const profileDoc = await db
        .collection("company_profiles")
        .doc(userId)
        .get();

      if (!profileDoc.exists) {
        res.status(404).json({ error: "Company profile not found" });
        return;
      }

      const profile = profileDoc.data() as CompanyProfile;
      res.json(profile);
    } catch (e: unknown) {
      console.error("Error getting company profile:", e);
      res.status(500).json({
        error: e instanceof Error ? e.message : "Failed to get company profile",
      });
    }
  }
);

// Create or update company profile
export const upsertCompanyProfile = onRequest(
  { region: "europe-west1", cors: true, timeoutSeconds: 60 },
  async (req, res): Promise<void> => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    try {
      const userId = req.headers["x-user-id"] as string;

      if (!userId || userId === "anon") {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const profileData = req.body as Partial<CompanyProfile>;

      if (!profileData.companyName) {
        res.status(400).json({ error: "Company name is required" });
        return;
      }

      const now = new Date();
      const profile: CompanyProfile = {
        uid: userId,
        companyName: profileData.companyName,
        vatNumber: profileData.vatNumber,
        legalForm: profileData.legalForm,
        annualRevenue: profileData.annualRevenue,
        employeeCount: profileData.employeeCount,
        yearsInBusiness: profileData.yearsInBusiness,
        certifications: profileData.certifications || [],
        technicalSkills: profileData.technicalSkills || [],
        languages: profileData.languages || ["IT"],
        headquarters: profileData.headquarters || "",
        operatingRegions: profileData.operatingRegions || [],
        primarySectors: profileData.primarySectors || [],
        cpvCodes: profileData.cpvCodes || [],
        preferredContractTypes: profileData.preferredContractTypes || [],
        minContractValue: profileData.minContractValue,
        maxContractValue: profileData.maxContractValue,
        competitionTolerance: profileData.competitionTolerance || "medium",
        createdAt: now,
        updatedAt: now,
      };

      await db.collection("company_profiles").doc(userId).set(profile);

      res.json({
        success: true,
        message: "Company profile saved successfully",
        profile,
      });
    } catch (e: unknown) {
      console.error("Error saving company profile:", e);
      res.status(500).json({
        error:
          e instanceof Error ? e.message : "Failed to save company profile",
      });
    }
  }
);

// Get best tenders for company
export const getBestTenders = onRequest(
  { region: "europe-west1", cors: true, timeoutSeconds: 120 },
  async (req, res): Promise<void> => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    try {
      const userId = req.headers["x-user-id"] as string;

      if (!userId || userId === "anon") {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const { limit = 10, daysBack = 7, regions, cpvCodes } = req.body ?? {};

      // Import the tool function
      const { getBestTendersTool } = await import("./graph/tools.js");

      const result = await getBestTendersTool.func({
        userId,
        limit: Number(limit),
        daysBack: Number(daysBack),
        regions,
        cpvCodes,
      });

      res.json(result);
    } catch (e: unknown) {
      console.error("Error getting best tenders:", e);
      res.status(500).json({
        error: e instanceof Error ? e.message : "Failed to get best tenders",
      });
    }
  }
);

// Analyze eligibility for specific tender
export const analyzeEligibility = onRequest(
  { region: "europe-west1", cors: true, timeoutSeconds: 60 },
  async (req, res): Promise<void> => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    try {
      const userId = req.headers["x-user-id"] as string;

      if (!userId || userId === "anon") {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const { tenderId } = req.body;

      if (!tenderId) {
        res.status(400).json({ error: "Tender ID is required" });
        return;
      }

      // Get company profile
      const profileDoc = await db
        .collection("company_profiles")
        .doc(userId)
        .get();
      if (!profileDoc.exists) {
        res.status(404).json({ error: "Company profile not found" });
        return;
      }

      const companyProfile = profileDoc.data() as CompanyProfile;

      // Import the tool function
      const { analyzeEligibilityTool } = await import("./graph/tools.js");

      const result = await analyzeEligibilityTool.func({
        tenderId,
        companyProfile: {
          annualRevenue: companyProfile.annualRevenue,
          employeeCount: companyProfile.employeeCount,
          yearsInBusiness: companyProfile.yearsInBusiness,
          certifications: companyProfile.certifications,
          technicalSkills: companyProfile.technicalSkills,
          legalForm: companyProfile.legalForm,
          operatingRegions: companyProfile.operatingRegions,
          primarySectors: companyProfile.primarySectors,
          competitionTolerance: companyProfile.competitionTolerance,
        },
      });

      res.json(result);
    } catch (e: unknown) {
      console.error("Error analyzing eligibility:", e);
      res.status(500).json({
        error: e instanceof Error ? e.message : "Failed to analyze eligibility",
      });
    }
  }
);

// Get personalized recommendations
export const getPersonalizedRecommendations = onRequest(
  { region: "europe-west1", cors: true, timeoutSeconds: 60 },
  async (req, res): Promise<void> => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    try {
      const userId = req.headers["x-user-id"] as string;

      if (!userId || userId === "anon") {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const { context } = req.body ?? {};

      // Import the tool function
      const { getPersonalizedRecommendationsTool } = await import(
        "./graph/tools.js"
      );

      const result = await getPersonalizedRecommendationsTool.func({
        userId,
        context,
      });

      res.json(result);
    } catch (e: unknown) {
      console.error("Error getting personalized recommendations:", e);
      res.status(500).json({
        error:
          e instanceof Error
            ? e.message
            : "Failed to get personalized recommendations",
      });
    }
  }
);
