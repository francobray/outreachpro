import React from 'react';
import { Campaign } from '../types';
import { Send, CheckCircle, AlertCircle, RefreshCw, Archive } from 'lucide-react';
import { Toaster } from 'react-hot-toast';

interface DashboardProps {
  campaigns: Campaign[];
  onViewDetails: (campaign: Campaign) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ campaigns, onViewDetails }) => {
  if (campaigns.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg shadow text-center">
        <h2 className="text-2xl font-bold mb-4">Dashboard</h2>
        <p className="text-gray-600">No campaigns have been created yet. Start by searching for businesses and creating a new campaign.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Toaster position="top-right" />
      <h2 className="text-2xl font-bold text-gray-900">Campaigns Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {campaigns.map((campaign) => (
          <div key={campaign.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{campaign.name}</h3>
                <p className="text-sm text-gray-500">
                  Created on {new Date(campaign.createdAt).toLocaleDateString()}
                </p>
              </div>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                campaign.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                campaign.status === 'completed' ? 'bg-green-100 text-green-700' :
                campaign.status === 'draft' ? 'bg-gray-100 text-gray-700' :
                'bg-red-100 text-red-700'
              }`}>
                {campaign.status}
              </span>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 flex items-center"><Send className="h-4 w-4 mr-2" /> Total Targets</span>
                <span className="font-medium">{campaign.stats.total_targets}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 flex items-center"><CheckCircle className="h-4 w-4 mr-2" /> Emails Sent</span>
                <span className="font-medium">{campaign.stats.emails_sent}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 flex items-center"><RefreshCw className="h-4 w-4 mr-2" /> Replies</span>
                <span className="font-medium">{campaign.stats.replies_received}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 flex items-center"><AlertCircle className="h-4 w-4 mr-2" /> Bounced</span>
                <span className="font-medium">{campaign.stats.emails_bounced}</span>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end space-x-2">
              <button 
                onClick={() => onViewDetails(campaign)}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                View Details
              </button>
              <button className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                {campaign.status === 'draft' ? 'Start Campaign' : 'Manage'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Dashboard; 