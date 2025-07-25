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
  id: string;
  name:string;
  targetBusinesses: Business[];
  emailTemplateId: string;
  status: 'draft' | 'in_progress' | 'completed' | 'archived';
  createdAt: string;
  updatedAt: string;
  stats: {
    total_targets: number;
    emails_sent: number;
    emails_bounced: number;
    replies_received: number;
  };
} 