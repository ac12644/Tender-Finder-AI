/**
 * Brevo (formerly Sendinblue) email service integration
 */

import { defineSecret } from "firebase-functions/params";

export const BREVO_API_KEY = defineSecret("BREVO_API_KEY");

const BREVO_API_URL = "https://api.brevo.com/v3";
const FROM_EMAIL = "info@bandifinder.it";
const FROM_NAME = "BandiFinder";

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  htmlContent?: string;
  textContent?: string;
  replyTo?: string;
  tags?: string[];
}

/**
 * Send transactional email via Brevo API
 */
export async function sendEmail({
  to,
  subject,
  htmlContent,
  textContent,
  replyTo,
  tags = [],
}: SendEmailOptions): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  const apiKey = BREVO_API_KEY.value();

  if (!apiKey) {
    console.warn(
      "[Brevo] BREVO_API_KEY not set. Email would be sent to:",
      to,
      "Subject:",
      subject
    );
    return {
      success: false,
      error: "BREVO_API_KEY not configured",
    };
  }

  try {
    const recipients = Array.isArray(to)
      ? to.map((email) => ({ email }))
      : [{ email: to }];

    const response = await fetch(`${BREVO_API_URL}/smtp/email`, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          email: FROM_EMAIL,
          name: FROM_NAME,
        },
        to: recipients,
        subject,
        htmlContent: htmlContent || textContent,
        textContent: textContent || htmlContent?.replace(/<[^>]*>/g, ""),
        replyTo: replyTo
          ? {
              email: replyTo,
              name: FROM_NAME,
            }
          : undefined,
        tags: ["tender-application", ...tags],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Brevo] API Error:", response.status, errorText);
      return {
        success: false,
        error: `Brevo API error: ${response.status} - ${errorText}`,
      };
    }

    const result = await response.json();
    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error) {
    console.error("[Brevo] Error sending email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send application email with proper formatting
 */
export async function sendApplicationEmail(
  recipientEmail: string,
  subject: string,
  body: string,
  tenderId?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // Convert plain text to HTML if needed
  const htmlContent = body.includes("<")
    ? body
    : `<div style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          ${body
            .split("\n")
            .map((line) => `<p>${line || "<br>"}</p>`)
            .join("")}
        </div>
        ${
          tenderId
            ? `<p style="margin-top: 20px; font-size: 12px; color: #666;">
          Questo messaggio è stato inviato tramite BandiFinder.it per il bando ${tenderId}
        </p>`
            : ""
        }
      </div>`;

  return sendEmail({
    to: recipientEmail,
    subject,
    htmlContent,
    textContent: body,
    tags: tenderId ? [`tender-${tenderId}`] : [],
  });
}
