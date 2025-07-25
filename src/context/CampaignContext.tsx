import React, { createContext, useState, useContext, ReactNode } from 'react';
import { Campaign, Business } from '../types';

interface CampaignContextType {
  campaigns: Campaign[];
  createCampaign: (newCampaign: Partial<Campaign>) => void;
  updateCampaign: (campaignId: string, updates: Partial<Campaign>) => void;
  deleteCampaign: (campaignId: string) => void;
  // Add any other actions you need, e.g., for managing businesses in a campaign
}

const CampaignContext = createContext<CampaignContextType | undefined>(undefined);

export const useCampaigns = () => {
  const context = useContext(CampaignContext);
  if (!context) {
    throw new Error('useCampaigns must be used within a CampaignProvider');
  }
  return context;
};

interface CampaignProviderProps {
  children: ReactNode;
}

export const CampaignProvider: React.FC<CampaignProviderProps> = ({ children }) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  const createCampaign = (newCampaign: Partial<Campaign>) => {
    const campaignWithDefaults: Campaign = {
      id: `campaign-${Date.now()}`,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stats: {
        total_targets: newCampaign.targetBusinesses?.length || 0,
        emails_sent: 0,
        emails_bounced: 0,
        replies_received: 0,
      },
      ...newCampaign,
    } as Campaign;
    
    setCampaigns(prev => [...prev, campaignWithDefaults]);
  };

  const updateCampaign = (campaignId: string, updates: Partial<Campaign>) => {
    setCampaigns(prev => 
      prev.map(c => 
        c.id === campaignId ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c
      )
    );
  };

  const deleteCampaign = (campaignId: string) => {
    setCampaigns(prev => prev.filter(c => c.id !== campaignId));
  };

  const value = {
    campaigns,
    createCampaign,
    updateCampaign,
    deleteCampaign,
  };

  return (
    <CampaignContext.Provider value={value}>
      {children}
    </CampaignContext.Provider>
  );
}; 