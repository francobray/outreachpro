import React, { useState } from 'react';
import { Business, Campaign, DecisionMaker, Location } from '../types';
import { X, Send, Loader2 } from 'lucide-react';

interface CampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedBusinesses: Business[];
  emailTemplates: any[]; // You should replace 'any' with a proper EmailTemplate type
  onCreateCampaign: (campaign: Partial<Campaign>) => void;
}

const CampaignModal: React.FC<CampaignModalProps> = ({ isOpen, onClose, selectedBusinesses, emailTemplates, onCreateCampaign }) => {
  const [campaignName, setCampaignName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);

  if (!isOpen) {
    return null;
  }

  const handleCreate = async () => {
    if (!campaignName || !selectedTemplateId) {
      alert('Please provide a campaign name and select a template.');
      return;
    }

    setIsCreating(true);
    
    const newCampaign: Partial<Campaign> = {
      name: campaignName,
      targetBusinesses: selectedBusinesses,
      emailTemplateId: selectedTemplateId,
      status: 'draft',
    };

    try {
      // Here you would typically make an API call to save the campaign
      // For now, we'll just simulate it and pass it to the parent
      await new Promise(resolve => setTimeout(resolve, 1000));
      onCreateCampaign(newCampaign);
      onClose();
    } catch (error) {
      console.error('Failed to create campaign:', error);
      alert('Failed to create campaign. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Create New Campaign</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label htmlFor="campaign-name" className="block text-sm font-medium text-gray-700 mb-2">
              Campaign Name
            </label>
            <input
              id="campaign-name"
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="e.g., Q4 Outreach for Miami Restaurants"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="email-template" className="block text-sm font-medium text-gray-700 mb-2">
              Email Template
            </label>
            <select
              id="email-template"
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="" disabled>Select a template</option>
              {emailTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-medium text-gray-800">Campaign Summary</h4>
            <p className="text-sm text-gray-600">
              This campaign will target <strong>{selectedBusinesses.length}</strong> businesses.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating || !campaignName || !selectedTemplateId}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
          >
            {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span>{isCreating ? 'Creating...' : 'Create Campaign'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CampaignModal; 