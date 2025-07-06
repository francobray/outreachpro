import React, { useState } from 'react';
import SearchForm from './components/SearchForm';
import BusinessTable from './components/BusinessTable';
import Dashboard from './components/Dashboard';
import { Search, BarChart3, Users, Mail } from 'lucide-react';
import { Business } from './types';
import EmailModal from './components/EmailModal';
// Import the version from package.json
import packageInfo from '../package.json';

function App() {
  const [activeTab, setActiveTab] = useState<'search' | 'dashboard'>('search');
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleSearch = async (keyword: string, location: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/search?keyword=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location)}`);
      const data = await response.json();
      setBusinesses(data);
    } catch (error) {
      console.error('Failed to search businesses:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBusinessUpdate = (updatedBusiness: Business) => {
    setBusinesses(prev => 
      prev.map(b => b.id === updatedBusiness.id ? { ...b, ...updatedBusiness } : b)
    );
  };

  const handleOpenModal = (business: Business) => {
    setSelectedBusiness(business);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedBusiness(null);
  };

  const handleEmailSent = (businessId: string) => {
    setBusinesses(prev => 
      prev.map(b => b.id === businessId ? { ...b, emailStatus: 'sent' } : b)
    );
  };

  const stats = [
    { label: 'Businesses Found', value: businesses.length, icon: Users },
    { label: 'Reports Generated', value: businesses.filter(b => b.auditReport).length, icon: BarChart3 },
    { label: 'Emails Sent', value: businesses.filter(b => b.emailStatus === 'sent').length, icon: Mail },
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
              Search & Outreach
            </button>
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'dashboard'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <BarChart3 className="inline h-5 w-5 mr-2" />
              Dashboard
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="w-full px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'search' ? (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            {/* Left Column - Search Form */}
            <div className="lg:col-span-1">
              <div className="sticky top-8 max-w-[300px] mx-auto lg:mx-0">
                <SearchForm 
                  onResults={setBusinesses} 
                  setIsLoading={setIsLoading}
                />
              </div>
            </div>
            
            {/* Right Column - Results */}
            <div className="lg:col-span-4">
              {(businesses.length > 0 || isLoading) ? (
                <BusinessTable businesses={businesses} isLoading={isLoading} onBusinessUpdate={handleBusinessUpdate} />
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
        ) : (
          <Dashboard />
        )}
      </main>
      {selectedBusiness && (
        <EmailModal 
          isOpen={isModalOpen} 
          onClose={handleCloseModal} 
          business={selectedBusiness}
          onEmailSent={handleEmailSent}
        />
      )}
    </div>
  );
}

export default App;