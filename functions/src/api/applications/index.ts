import { onRequest } from "firebase-functions/v2/https";
import { db } from "../../lib/firestore";
import { setCors } from "../../utils/cors";

/**
 * Get all applications for a user
 */
export const applications = onRequest(
  {
    region: "europe-west1",
    cors: true,
    timeoutSeconds: 30,
    secrets: ["BREVO_API_KEY"],
  },
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

      if (req.method === "GET") {
        // Get all applications for user
        const snapshot = await db
          .collection("applications")
          .where("userId", "==", userId)
          .orderBy("createdAt", "desc")
          .limit(100)
          .get();

        const applications = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          // Convert Firestore timestamps to ISO strings
          createdAt:
            doc.data().createdAt?.toDate?.()?.toISOString() ||
            new Date().toISOString(),
          updatedAt:
            doc.data().updatedAt?.toDate?.()?.toISOString() ||
            new Date().toISOString(),
          submittedAt: doc.data().submittedAt?.toDate?.()?.toISOString(),
          statusUpdatedAt: doc
            .data()
            .statusUpdatedAt?.toDate?.()
            ?.toISOString(),
          communications: (doc.data().communications || []).map(
            (comm: {
              type?: string;
              content?: string;
              sentAt?: { toDate?: () => Date } | string | Date;
              recipient?: string;
              subject?: string;
            }) => {
              const sentAtValue = comm.sentAt;
              const sentAt =
                typeof sentAtValue === "object" &&
                sentAtValue !== null &&
                typeof (sentAtValue as { toDate?: () => Date }).toDate ===
                  "function"
                  ? (sentAtValue as { toDate: () => Date })
                      .toDate()
                      .toISOString()
                  : sentAtValue instanceof Date
                  ? sentAtValue.toISOString()
                  : typeof sentAtValue === "string"
                  ? sentAtValue
                  : undefined;
              return {
                ...comm,
                sentAt,
              };
            }
          ),
        }));

        res.json({ applications });
        return;
      }

      if (req.method === "POST") {
        // Create or update application
        const applicationData = req.body;

        if (!applicationData.tenderId || !applicationData.tenderTitle) {
          res.status(400).json({
            error: "tenderId and tenderTitle are required",
          });
          return;
        }

        // Check if application already exists
        const existingApps = await db
          .collection("applications")
          .where("userId", "==", userId)
          .where("tenderId", "==", applicationData.tenderId)
          .limit(1)
          .get();

        const now = new Date();
        const data = {
          ...applicationData,
          userId,
          createdAt: now,
          updatedAt: now,
        };

        if (!existingApps.empty) {
          // Update existing
          const existingId = existingApps.docs[0].id;
          await db
            .collection("applications")
            .doc(existingId)
            .update({
              ...data,
              updatedAt: now,
            });
          res.json({
            success: true,
            applicationId: existingId,
            message: "Application updated",
          });
        } else {
          // Create new
          const newAppRef = db.collection("applications").doc();
          await newAppRef.set(data);
          res.json({
            success: true,
            applicationId: newAppRef.id,
            message: "Application created",
          });
        }
        return;
      }

      if (req.method === "PATCH") {
        // Update application status
        const { applicationId, status, notes } = req.body;

        if (!applicationId) {
          res.status(400).json({ error: "applicationId is required" });
          return;
        }

        const appRef = db.collection("applications").doc(applicationId);
        const appDoc = await appRef.get();

        if (!appDoc.exists) {
          res.status(404).json({ error: "Application not found" });
          return;
        }

        const appData = appDoc.data();
        if (appData?.userId !== userId) {
          res.status(403).json({ error: "Forbidden" });
          return;
        }

        const updateData: {
          updatedAt: Date;
          status?: string;
          statusUpdatedAt?: Date;
          notes?: string;
        } = {
          updatedAt: new Date(),
        };

        if (status) {
          updateData.status = status;
          updateData.statusUpdatedAt = new Date();
        }

        if (notes !== undefined) {
          updateData.notes = notes;
        }

        await appRef.update(updateData);

        res.json({
          success: true,
          message: "Application updated",
        });
        return;
      }

      res.status(405).json({ error: "Method not allowed" });
    } catch (error) {
      console.error("Error in applications endpoint:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);
