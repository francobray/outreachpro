import React from 'react';
import { Campaign } from '../types';
import { ArrowLeft, Send, CheckCircle, RefreshCw, AlertCircle } from 'lucide-react';

interface CampaignDetailsProps {
  campaign: Campaign;
  onBack: () => void;
}

const CampaignDetails: React.FC<CampaignDetailsProps> = ({ campaign, onBack }) => {
  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Dashboard
      </button>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{campaign.name}</h2>
            <p className="text-gray-500">Campaign Details</p>
          </div>
          <span className={`px-2 py-1 text-sm font-medium rounded-full ${
            campaign.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
            campaign.status === 'completed' ? 'bg-green-100 text-green-700' :
            campaign.status === 'draft' ? 'bg-gray-100 text-gray-700' :
            'bg-red-100 text-red-700'
          }`}>
            {campaign.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h4 className="text-sm font-medium text-gray-500 flex items-center"><Send className="h-4 w-4 mr-2" />Total Targets</h4>
          <p className="text-3xl font-bold text-gray-900 mt-2">{campaign.stats.total_targets}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h4 className="text-sm font-medium text-gray-500 flex items-center"><CheckCircle className="h-4 w-4 mr-2" />Emails Sent</h4>
          <p className="text-3xl font-bold text-gray-900 mt-2">{campaign.stats.emails_sent}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h4 className="text-sm font-medium text-gray-500 flex items-center"><RefreshCw className="h-4 w-4 mr-2" />Replies</h4>
          <p className="text-3xl font-bold text-gray-900 mt-2">{campaign.stats.replies_received}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h4 className="text-sm font-medium text-gray-500 flex items-center"><AlertCircle className="h-4 w-4 mr-2" />Bounced</h4>
          <p className="text-3xl font-bold text-gray-900 mt-2">{campaign.stats.emails_bounced}</p>
        </div>
      </div>

      <div>
        <h3 className="text-xl font-semibold text-gray-900 mb-4">Target Businesses ({campaign.targetBusinesses.length})</h3>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Business</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contacts</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {campaign.targetBusinesses.map(business => (
                <tr key={business.id}>
                  <td className="px-6 py-4 whitespace-nowrap align-top">
                    <div className="text-sm font-medium text-gray-900">{business.name}</div>
                    <div className="text-sm text-gray-500">{business.locations[0]?.address}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap align-top">
                    <div className="space-y-2">
                    {business.decisionMakers && business.decisionMakers.length > 0 ? (
                      business.decisionMakers.map(dm => (
                        <div key={dm.id} className="text-sm text-gray-900">
                          <div>{dm.name} <span className="text-xs text-gray-500">{dm.title}</span></div>
                          <div className="text-xs text-blue-600">{dm.email}</div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-gray-500">No decision makers found.</div>
                    )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap align-top">
                     <div className="space-y-2">
                     {business.decisionMakers && business.decisionMakers.length > 0 ? (
                       business.decisionMakers.map(dm => (
                        <div key={dm.id}>
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            dm.email_status === 'sent' ? 'bg-green-100 text-green-800' :
                            dm.email_status === 'bounced' ? 'bg-red-100 text-red-800' :
                            dm.email_status === 'replied' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {dm.email_status || 'pending'}
                          </span>
                        </div>
                       ))
                     ) : (
                      <div className="text-sm text-gray-500">-</div>
                     )}
                     </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CampaignDetails; 