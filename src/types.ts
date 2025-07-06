export interface Business {
  id: string;
  name: string;
  address: string;
  website: string | null;
  placeId: string;
  phone?: string;
  emails: string[];
  auditReport: any;
  emailStatus: 'pending' | 'sent' | 'error' | 'unverified';
} 