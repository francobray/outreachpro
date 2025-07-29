import React, { useState, useEffect } from 'react';
import SearchForm from './components/SearchForm';
import BusinessTable from './components/BusinessTable';
import EmailTemplates from './components/EmailTemplates';
import PlacesPage from './components/PlacesPage';
import ContactsPage from './components/ContactsPage';
import EmailActivityPage from './components/EmailActivityPage';
import ApiCostsPage from './components/ApiCostsPage';
import CampaignModal from './components/CampaignModal';
import AlertModal from './components/AlertModal';
import Sidebar from './components/Sidebar';
import { Search } from 'lucide-react';
import { Business, Campaign } from './types';
import { useCampaigns, CampaignProvider } from './context/CampaignContext';
import packageInfo from '../package.json';
import { Toaster } from 'react-hot-toast';
import CostEstimator from './components/CostEstimator';

// Define the EmailTemplate type
interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<'search' | 'templates' | 'places' | 'contacts' | 'email-activity' | 'api-costs'>('search');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedBusinesses, setSelectedBusinesses] = useState<Business[]>([]);
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'info' | 'warning' | 'error' | 'success' | 'confirm';
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });
  const [includeApollo, setIncludeApollo] = useState(true);
  const [estimatedResults, setEstimatedResults] = useState(20);

  const { createCampaign } = useCampaigns();

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

  const handleSetBusinesses = (b: Business[]) => {
    setBusinesses(b);
  };

  const openCampaignModal = () => {
    if (selectedBusinesses.length > 0) {
      setIsCampaignModalOpen(true);
    } else {
      setAlertModal({
        isOpen: true,
        title: 'No Businesses Selected',
        message: 'Please select at least one business to create a campaign.',
        type: 'warning'
      });
    }
  };

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  return (
    <CampaignProvider>
      <div className="bg-gray-50 min-h-screen">
        {/* Sidebar */}
        <Sidebar 
          activeTab={activeTab} 
          onTabChange={setActiveTab}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleSidebar}
        />

        {/* Main Content Area */}
        <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
          {/* Header */}
          <header className="bg-white shadow-sm border-b border-gray-200">
            <div className="px-6 py-4">
              <div className="flex justify-between items-center">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    {activeTab === 'search' && 'Search Places'}
                    {activeTab === 'templates' && 'Email Templates'}
                    {activeTab === 'places' && 'Places Database'}
                    {activeTab === 'contacts' && 'Contacts'}
                    {activeTab === 'api-costs' && 'API Costs'}
                    {activeTab === 'email-activity' && 'Email Activity'}
                  </h1>
                  <p className="text-sm text-gray-600">
                    {activeTab === 'search' && 'Find and manage local businesses for your outreach campaigns'}
                    {activeTab === 'templates' && 'Create and manage email templates for your campaigns'}
                    {activeTab === 'places' && 'View and manage your saved business database'}
                    {activeTab === 'contacts' && 'View and manage Apollo contacts from your database'}
                    {activeTab === 'api-costs' && 'Track your monthly API usage and costs'}
                    {activeTab === 'email-activity' && 'Track the performance of your email campaigns'}
                  </p>
                </div>
                
                <div className="flex items-center space-x-4">
                  <span className="inline-flex items-center px-3 py-1 text-sm font-medium bg-blue-100 text-blue-800 rounded-full">
                    v{packageInfo.version}
                  </span>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="p-6">
            {activeTab === 'search' ? (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-1">
                  <div className="space-y-6">
                    <SearchForm 
                      onResults={handleSetBusinesses} 
                      setIsLoading={setIsLoading}
                      includeApollo={includeApollo}
                      setIncludeApollo={setIncludeApollo}
                      estimatedResults={estimatedResults}
                      setEstimatedResults={setEstimatedResults}
                    />
                    <CostEstimator
                      estimatedResults={estimatedResults}
                      includeApollo={includeApollo}
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
                      emailTemplates={emailTemplates}
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
            ) : activeTab === 'places' ? (
              <PlacesPage />
            ) : activeTab === 'contacts' ? (
              <ContactsPage />
            ) : activeTab === 'api-costs' ? (
              <ApiCostsPage />
            ) : activeTab === 'email-activity' ? (
              <EmailActivityPage />
            ) : (
              <EmailTemplates />
            )}
          </main>
        </div>
        
        <CampaignModal 
          isOpen={isCampaignModalOpen}
          onClose={() => setIsCampaignModalOpen(false)}
          selectedBusinesses={selectedBusinesses}
          emailTemplates={emailTemplates}
          onCreateCampaign={createCampaign}
        />
        <AlertModal
          isOpen={alertModal.isOpen}
          onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
          title={alertModal.title}
          message={alertModal.message}
          type={alertModal.type}
        />
        <Toaster position="top-right" />
      </div>
    </CampaignProvider>
  );
}

export default App;