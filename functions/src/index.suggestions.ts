import { onRequest } from "firebase-functions/v2/https";
import {
  generateSmartSuggestionsTool,
  analyzeUserBehaviorTool,
  generateContextualSuggestionsTool,
} from "./graph/tools";
import { profilesCol } from "./lib/firestore.extras";

function setCors(res: { set: (key: string, value: string) => void }) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// Generate smart suggestions based on user profile and context
export const suggestions = onRequest(
  { region: "europe-west1", cors: true, timeoutSeconds: 60 },
  async (req, res): Promise<void> => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    try {
      const userId = req.headers["x-user-id"] as string;
      const {
        context,
        suggestionType = "search",
        limit = 5,
        currentQuery,
        searchResults = [],
        userIntent = "explore",
      } = req.body ?? {};

      let userProfile = null;

      // Get user profile if userId is provided
      if (userId && userId !== "anon") {
        try {
          const profileDoc = await profilesCol().doc(userId).get();
          if (profileDoc.exists) {
            const data = profileDoc.data();
            userProfile = {
              regions: data?.regions || [],
              cpv: data?.cpv || [],
              daysBack: data?.daysBack || 7,
              minValueEUR: data?.minValueEUR || null,
            };
          }
        } catch (error) {
          console.warn("Could not fetch user profile:", error);
        }
      }

      let suggestions: string[] = [];

      // Generate suggestions based on type
      switch (suggestionType) {
        case "behavior":
          // Get user's search history and behavior data
          const searchHistory = req.body?.searchHistory || [];
          const clickedTenders = req.body?.clickedTenders || [];
          const timeSpent = req.body?.timeSpent || 0;

          suggestions = await analyzeUserBehaviorTool.func({
            userId,
            searchHistory,
            clickedTenders,
            timeSpent,
          });
          break;

        case "contextual":
          suggestions = await generateContextualSuggestionsTool.func({
            currentQuery,
            searchResults,
            userIntent,
          });
          break;

        case "search":
        default:
          suggestions = await generateSmartSuggestionsTool.func({
            context,
            userProfile: userProfile || null,
            suggestionType: "search",
            limit,
          });
          break;
      }

      res.json({
        suggestions: suggestions.slice(0, limit),
        type: suggestionType,
        generated_at: new Date().toISOString(),
      });
    } catch (e: unknown) {
      console.error("Error generating suggestions:", e);
      res.status(500).json({
        error:
          e instanceof Error ? e.message : "Failed to generate suggestions",
        suggestions: [
          "trova bandi informatica pubblicati oggi in Italia",
          "mostra bandi con scadenza entro 7 giorni in Lombardia",
          "riassumi i bandi più recenti (max 5)",
        ],
      });
    }
  }
);

// Get trending suggestions based on recent market activity
export const trendingSuggestions = onRequest(
  { region: "europe-west1", cors: true, timeoutSeconds: 30 },
  async (req, res): Promise<void> => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    try {
      const { limit = 5 } = req.query;

      // Generate trending suggestions
      const suggestions = await generateSmartSuggestionsTool.func({
        context: "trending market analysis",
        suggestionType: "search",
        limit: Number(limit),
      });

      res.json({
        suggestions,
        type: "trending",
        generated_at: new Date().toISOString(),
      });
    } catch (e: any) {
      console.error("Error generating trending suggestions:", e);
      res.status(500).json({
        error: e?.message ?? "Failed to generate trending suggestions",
        suggestions: [
          "trova bandi software pubblicati oggi",
          "mostra bandi costruzioni con scadenza entro 7 giorni",
          "cerca bandi servizi ambientali in Italia",
        ],
      });
    }
  }
);

// Get personalized suggestions for a specific user
export const personalizedSuggestions = onRequest(
  { region: "europe-west1", cors: true, timeoutSeconds: 60 },
  async (req, res): Promise<void> => {
    // Set CORS headers for all requests
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, x-user-id"
    );

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    try {
      const userId = req.headers["x-user-id"] as string;
      const { limit = 5 } = req.body ?? {};

      if (!userId || userId === "anon") {
        res
          .status(400)
          .json({ error: "User ID required for personalized suggestions" });
        return;
      }

      // Get user profile
      const profileDoc = await profilesCol().doc(userId).get();
      if (!profileDoc.exists) {
        res.status(404).json({ error: "User profile not found" });
        return;
      }

      const profileData = profileDoc.data();
      const userProfile = {
        regions: profileData?.regions || [],
        cpv: profileData?.cpv || [],
        daysBack: profileData?.daysBack || 7,
        minValueEUR: profileData?.minValueEUR || null,
      };

      // Get user's recent activity
      const searchHistory = req.body?.searchHistory || [];
      const clickedTenders = req.body?.clickedTenders || [];
      const timeSpent = req.body?.timeSpent || 0;

      // Generate personalized suggestions
      const suggestions = await analyzeUserBehaviorTool.func({
        userId,
        searchHistory,
        clickedTenders,
        timeSpent,
      });

      res.json({
        suggestions: suggestions.slice(0, limit),
        type: "personalized",
        userProfile,
        generated_at: new Date().toISOString(),
      });
    } catch (e: any) {
      console.error("Error generating personalized suggestions:", e);
      res.status(500).json({
        error: e?.message ?? "Failed to generate personalized suggestions",
        suggestions: [],
      });
    }
  }
);
