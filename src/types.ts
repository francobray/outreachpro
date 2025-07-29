export interface DecisionMaker {
  id: string;
  name: string;
  title: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  email_status?: 'pending' | 'sent' | 'bounced' | 'replied';
}

export interface Location {
  id: string;
  address: string;
  website: string | null;
  phone: string;
  emails: string[];
  websiteStatus?: 'ok' | 'timeout' | 'not_found' | 'error' | 'enotfound';
}

export interface Business {
  id: string;
  name: string;
  placeId: string;
  locations: Location[];
  decisionMakers: DecisionMaker[];
  category?: string;
  types?: string[];
  rating?: number;
  userRatingsTotal?: number;
  apolloStatus?: 'pending' | 'in_progress' | 'found' | 'not_found' | 'error';
  graderReport?: any;
  addedAt: string;
}

export interface Campaign {
  _id: string;
  name: string;
  businesses: Business[];
  emailTemplate: EmailTemplate;
  status: 'draft' | 'running' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface ApiCallLog {
  _id: string;
  api: string;
  timestamp: string;
  details: {
    endpoint: string;
    keyword?: string;
    location?: string;
    placeId?: string;
    businessName?: string;
    foundContacts?: {
      name: string;
      title: string;
      linkedin_url: string;
    }[];
    organizationName?: string;
    organizationWebsite?: string;
  };
  metadata?: any; // For backward compatibility with old log structure
} 