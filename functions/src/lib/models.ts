export type UserProfile = {
  uid: string;
  // preferenze "Per te"
  regions: string[]; // es: ["Lombardia","Lazio"] (NUTS-2 friendly)
  cpv: string[]; // max 3
  daysBack: number; // 0/3/7
  minValueEUR?: number | null; // filtro opzionale
  notifyMorning: boolean; // digest alle 9:00
  createdAt: Date;
  updatedAt: Date;
};

export type CompanyProfile = {
  uid: string;
  // Company details
  companyName: string;
  vatNumber?: string;
  legalForm?: string; // SRL, SPA, etc.

  // Eligibility criteria
  annualRevenue?: number; // For financial capacity checks
  employeeCount?: number; // For technical capacity
  yearsInBusiness?: number; // For experience requirements

  // Technical capabilities
  certifications: string[]; // ISO, CE, etc.
  technicalSkills: string[]; // Software, hardware, services
  languages: string[]; // IT, EN, FR, etc.

  // Geographic presence
  headquarters: string; // City/Region
  operatingRegions: string[]; // Where company operates

  // Industry focus
  primarySectors: string[]; // Main business areas
  cpvCodes: string[]; // Preferred CPV codes

  // Preferences
  preferredContractTypes: string[]; // Services, Supply, Works
  minContractValue?: number;
  maxContractValue?: number;

  // Risk tolerance
  competitionTolerance: "low" | "medium" | "high"; // How much competition willing to face

  createdAt: Date;
  updatedAt: Date;
};

export type EligibilityCriteria = {
  tenderId: string;

  // Financial requirements
  minAnnualRevenue?: number;
  minFinancialCapacity?: number;
  insuranceRequired?: boolean;
  bankGuarantee?: number;

  // Technical requirements
  certificationsRequired: string[];
  technicalExperience: string[];
  minYearsExperience?: number;

  // Legal requirements
  legalForm?: string[];
  vatRegistration: boolean;
  taxCompliance: boolean;

  // Geographic requirements
  allowedRegions?: string[];
  localPresenceRequired?: boolean;

  // Other requirements
  languagesRequired: string[];
  submissionDeadline: string;
  estimatedValue: number;

  // AI-extracted requirements
  extractedRequirements: string[];
  complexityScore: number; // 1-10 scale
  competitionLevel: "low" | "medium" | "high";
};

export type TenderMatch = {
  tenderId: string;
  userId: string;

  // Match scores (0-1)
  eligibilityScore: number; // How well company meets requirements
  preferenceScore: number; // How well tender matches preferences
  competitionScore: number; // Likelihood of winning (inverse of competition)
  urgencyScore: number; // Time sensitivity

  // Overall recommendation
  overallScore: number; // Weighted combination
  recommendation: "high" | "medium" | "low" | "skip";

  // Reasons
  eligibilityReasons: string[]; // Why eligible/not eligible
  riskFactors: string[]; // Potential issues
  opportunities: string[]; // Why this is a good match

  createdAt: Date;
};

export type SavedSearch = {
  id: string; // doc id
  uid: string;
  country: string; // "ITA"
  daysBack: number;
  cpv: string[];
  text?: string;
  minValueEUR?: number | null;
  regions?: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type FavoriteTender = {
  uid: string;
  tenderId: string; // publication-number
  createdAt: Date;
};

export type Application = {
  id: string; // Firestore doc ID
  userId: string;
  tenderId: string;
  tenderTitle: string;
  buyerName: string;

  // Application content
  draftContent: string; // Email body or form content
  subject?: string; // Email subject
  tone: "formal" | "professional" | "friendly" | "business";

  // Submission details
  submissionMethod: "email" | "form" | "manual";
  recipientEmail?: string;
  submissionUrl?: string;
  submittedAt?: Date;

  // Status tracking
  status:
    | "draft"
    | "sent"
    | "submitted"
    | "accepted"
    | "rejected"
    | "withdrawn";
  statusUpdatedAt?: Date;

  // Communication history
  communications: Array<{
    type: "email" | "form" | "note";
    content: string;
    sentAt: Date;
    recipient?: string;
    subject?: string;
  }>;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  notes?: string;
};
