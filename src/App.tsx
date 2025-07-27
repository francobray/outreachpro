import React, { useState, useEffect } from 'react';
import SearchForm from './components/SearchForm';
import BusinessTable from './components/BusinessTable';
import EmailTemplates from './components/EmailTemplates';
import PlacesPage from './components/PlacesPage';
import CampaignModal from './components/CampaignModal';
import AlertModal from './components/AlertModal';
import { Search, Mail, Database } from 'lucide-react';
import { Business, Campaign } from './types';
import { useCampaigns, CampaignProvider } from './context/CampaignContext';
import packageInfo from '../package.json';
import { Toaster } from 'react-hot-toast';

// Define the EmailTemplate type
interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<'search' | 'templates' | 'places'>('search');
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


  
  return (
    <CampaignProvider>
      <div className="bg-gray-50 min-h-screen">
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
                {/* "Clear Results" button was here */}
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
                onClick={() => setActiveTab('places')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'places'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Database className="inline h-5 w-5 mr-2" />
                Places Database
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