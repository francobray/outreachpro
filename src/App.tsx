import React, { useState, useEffect } from 'react';
import SearchForm from './components/SearchForm';
import BusinessTable from './components/BusinessTable';
import Dashboard from './components/Dashboard';
import EmailTemplates from './components/EmailTemplates';
import CampaignModal from './components/CampaignModal';
import CampaignDetails from './components/CampaignDetails'; // Import CampaignDetails
import { Search, Mail, Briefcase, Send, Users } from 'lucide-react';
import { Business, Campaign } from './types';
import { useCampaigns } from './context/CampaignContext';
import packageInfo from '../package.json';

// Define the EmailTemplate type
interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<'search' | 'templates' | 'dashboard'>('search');
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedBusinesses, setSelectedBusinesses] = useState<Business[]>([]);
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  const { campaigns, createCampaign } = useCampaigns();

  // Load email templates from local storage
  useEffect(() => {
    const savedTemplates = localStorage.getItem('emailTemplates');
    if (savedTemplates) {
      setEmailTemplates(JSON.parse(savedTemplates));
    }
  }, []);

  const handleSelectionChange = (selected: Business[]) => {
    setSelectedBusinesses(selected);
  };

  const openCampaignModal = () => {
    if (selectedBusinesses.length > 0) {
      setIsCampaignModalOpen(true);
    } else {
      alert('Please select at least one business to create a campaign.');
    }
  };

  const handleViewCampaignDetails = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
  };

  const handleBackToDashboard = () => {
    setSelectedCampaign(null);
  };
  
  const stats = [
    { label: 'Businesses Found', value: businesses.length, icon: Users },
    { label: 'Campaigns Created', value: campaigns.length, icon: Send },
    { label: 'Emails Sent', value: campaigns.reduce((acc, c) => acc + c.stats.emails_sent, 0), icon: Mail },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-3">
              <img
                src="https://www.rayapp.io/wp-content/uploads/2024/12/logo-rayapp-azulwebp-300x150-1.webp"
                alt="RAY Logo"
                className="h-10 w-auto object-contain"
              />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Google Place Scrapper</h1>
                <p className="text-sm text-gray-600">Local Business Campaign Manager</p>
              </div>
              <div className="ml-2">
                <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                  v{packageInfo.version}
                </span>
              </div>
            </div>
            
            {/* Stats */}
            <div className="hidden md:flex items-center space-x-8">
              {stats.map((stat, index) => (
                <div key={index} className="text-center">
                  <div className="flex items-center justify-center space-x-2">
                    <stat.icon className="h-5 w-5 text-blue-600" />
                    <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
                  </div>
                  <div className="text-sm text-gray-600">{stat.label}</div>
                </div>
              ))}
              {businesses.length > 0 && (
                <button
                  onClick={() => setBusinesses([])}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Clear Results
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('search')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'search'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Search className="inline h-5 w-5 mr-2" />
              Search Places
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'templates'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Mail className="inline h-5 w-5 mr-2" />
              Email Templates
            </button>
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'dashboard'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Briefcase className="inline h-5 w-5 mr-2" />
              Dashboard
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="w-full px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'search' ? (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            <div className="lg:col-span-1">
              <div className="sticky top-8 max-w-[300px] mx-auto lg:mx-0">
                <SearchForm 
                  onResults={setBusinesses} 
                  setIsLoading={setIsLoading}
                />
              </div>
            </div>
            
            <div className="lg:col-span-4">
              {(businesses.length > 0 || isLoading) ? (
                <BusinessTable 
                  businesses={businesses} 
                  isLoading={isLoading}
                  onSelectionChange={handleSelectionChange}
                  onCreateCampaign={openCampaignModal}
                />
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center min-h-[400px] flex items-center justify-center">
                  <div>
                    <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Ready to find businesses</h3>
                    <p className="text-gray-600">Enter a business type and location to get started with your outreach campaign.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'dashboard' ? (
          selectedCampaign ? (
            <CampaignDetails campaign={selectedCampaign} onBack={handleBackToDashboard} />
          ) : (
            <Dashboard campaigns={campaigns} onViewDetails={handleViewCampaignDetails} />
          )
        ) : (
          <EmailTemplates />
        )}
      </main>
      
      <CampaignModal 
        isOpen={isCampaignModalOpen}
        onClose={() => setIsCampaignModalOpen(false)}
        selectedBusinesses={selectedBusinesses}
        emailTemplates={emailTemplates}
        onCreateCampaign={createCampaign}
      />
    </div>
  );
}

export default App;