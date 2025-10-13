import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AuthProvider } from "@/components/AuthProvider";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bandifinder.it — Trova i bandi pubblici più adatti alla tua azienda",
  description:
    "Scopri e analizza bandi pubblici italiani ed europei con l'intelligenza artificiale. Trova le opportunità più adatte alla tua azienda.",
  applicationName: "Bandifinder.it",
  keywords: [
    "bandi pubblici",
    "appalti",
    "gare",
    "tender",
    "TED",
    "intelligenza artificiale",
    "AI",
    "Italia",
    "Europa",
  ],
  authors: [{ name: "Bandifinder.it" }],
  creator: "Bandifinder.it",
  publisher: "Bandifinder.it",
  robots: "index, follow",
  openGraph: {
    title:
      "Bandifinder.it — Trova i bandi pubblici più adatti alla tua azienda",
    description:
      "Scopri e analizza bandi pubblici italiani ed europei con l'intelligenza artificiale. Trova le opportunità più adatte alla tua azienda.",
    url: "https://bandifinder.it",
    siteName: "Bandifinder.it",
    locale: "it_IT",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title:
      "Bandifinder.it — Trova i bandi pubblici più adatti alla tua azienda",
    description:
      "Scopri e analizza bandi pubblici italiani ed europei con l'intelligenza artificiale.",
  },
};

export const viewport: Viewport = { themeColor: "#0ea5e9" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen`}
      >
        <AuthProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          <Toaster />
          <Analytics />
        </AuthProvider>
      </body>
    </html>
  );
}
