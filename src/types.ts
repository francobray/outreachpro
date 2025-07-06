export interface Business {
  id: string;
  name: string;
  address: string;
  website: string | null;
  placeId: string;
  phone: string;
  emails: string[];
  auditReport?: any;
  emailStatus?: 'pending' | 'sent';
  addedAt: string;
  category?: string;
  types?: string[];
  decisionMakers?: { name: string; title: string; email?: string; phone?: string; email_status?: string; linkedin_url?: string }[];
  rating?: number;
  userRatingsTotal?: number;
  apolloStatus?: 'found' | 'not_found' | 'error';
  graderScore?: number;
} 