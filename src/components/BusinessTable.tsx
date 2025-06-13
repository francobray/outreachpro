import React, { useState } from 'react';
import { 
  Globe, 
  MapPin, 
  Phone, 
  FileText, 
  Mail, 
  Download, 
  Loader2, 
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Map,
  Check,
  Play
} from 'lucide-react';
import EmailModal from './EmailModal';

interface Business {
  id: string;
  name: string;
  address: string;
  website: string | null;
  placeId: string;
  phone: string;
  emails: string[];
  auditReport?: any;
  emailStatus?: 'pending' | 'sent';
}

interface BusinessTableProps {
  businesses: Business[];
  isLoading: boolean;
  onBusinessUpdate?: (business: Business) => void;
}

const BusinessTable: React.FC<BusinessTableProps> = ({ businesses, isLoading, onBusinessUpdate }) => {
  const [loadingStates, setLoadingStates] = useState<{[key: string]: string}>({});
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [businessData, setBusinessData] = useState<{[key: string]: Business}>({});
  const [selectedBusinesses, setSelectedBusinesses] = useState<Set<string>>(new Set());
  const [isExecuting, setIsExecuting] = useState(false);
  const [emailingBusinesses, setEmailingBusinesses] = useState<Set<string>>(new Set());
  const [recentlySentEmails, setRecentlySentEmails] = useState<Set<string>>(new Set());

  const updateLoadingState = (businessId: string, state: string) => {
    setLoadingStates(prev => ({ ...prev, [businessId]: state }));
  };

  const updateBusinessData = (businessId: string, updates: Partial<Business>) => {
    setBusinessData(prev => {
      const updated = { ...prev[businessId], ...updates };
      // Call onBusinessUpdate if provided
      if (onBusinessUpdate) {
        const base = businesses.find(b => b.id === businessId);
        onBusinessUpdate({
          ...base,
          ...updated,
          emails: (updated.emails ?? base?.emails ?? []) as string[],
        } as Business);
      }
      return {
        ...prev,
        [businessId]: updated
      };
    });
  };

  const getBusinessData = (business: Business) => {
    return { ...business, ...businessData[business.id] };
  };

  const generateAuditReport = async (business: Business) => {
    updateLoadingState(business.id, 'audit');
    
    try {
      const response = await fetch(`http://localhost:3001/api/audit/${business.id}`, {
        method: 'POST',
      });
      const data = await response.json();
      updateBusinessData(business.id, { auditReport: data.auditReport });
    } catch (error) {
      console.error('Failed to generate audit report:', error);
    } finally {
      updateLoadingState(business.id, '');
    }
  };

  const findEmails = async (business: Business) => {
    updateLoadingState(business.id, 'emails');
    
    try {
      const response = await fetch(`http://localhost:3001/api/emails/${business.id}`, {
        method: 'POST',
      });
      const data = await response.json();
      updateBusinessData(business.id, { emails: data.emails });
    } catch (error) {
      console.error('Failed to find emails:', error);
    } finally {
      updateLoadingState(business.id, '');
    }
  };

  const handleSendEmail = (business: Business) => {
    const enrichedBusiness = getBusinessData(business);
    setSelectedBusiness(enrichedBusiness);
    setEmailModalOpen(true);
  };

  const handleEmailSent = (businessId: string) => {
    updateBusinessData(businessId, { emailStatus: 'sent' });
    
    // Add to recently sent for animation
    setRecentlySentEmails(prev => new Set(prev).add(businessId));
    
    // Remove from recently sent after animation completes
    setTimeout(() => {
      setRecentlySentEmails(prev => {
        const newSet = new Set(prev);
        newSet.delete(businessId);
        return newSet;
      });
    }, 2000);
  };

  const handleSelectBusiness = (businessId: string) => {
    setSelectedBusinesses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(businessId)) {
        newSet.delete(businessId);
      } else {
        newSet.add(businessId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedBusinesses.size === businesses.length) {
      // Deselect all
      setSelectedBusinesses(new Set());
    } else {
      // Select all
      setSelectedBusinesses(new Set(businesses.map(b => b.id)));
    }
  };

  const downloadReport = async (reportId: string, businessName: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/reports/${reportId}/download`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `${businessName.replace(/\s+/g, '_')}_audit_report.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download report:', error);
    }
  };

  const handleExecute = async () => {
    if (selectedBusinesses.size === 0) return;
    
    setIsExecuting(true);
    
    try {
      const selectedBusinessList = businesses.filter(b => selectedBusinesses.has(b.id));
      
      // Execute the complete workflow for each selected business
      for (const business of selectedBusinessList) {
        const enrichedBusiness = getBusinessData(business);
        
        // Step 1: Generate audit report if not exists
        if (!enrichedBusiness.auditReport) {
          await generateAuditReport(business);
          // Small delay to show progression
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Step 2: Find emails if not found
        if (!enrichedBusiness.emails || enrichedBusiness.emails.length === 0) {
          await findEmails(business);
          // Small delay to show progression
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Step 3: Send email if not sent
        const currentBusinessData = getBusinessData(business);
        if (currentBusinessData.emails && currentBusinessData.emails.length > 0 && 
            currentBusinessData.emailStatus !== 'sent') {
          // Add business to emailing set for animation
          setEmailingBusinesses(prev => new Set(prev).add(business.id));
          await sendEmailAutomatically(business, currentBusinessData.emails[0]);
          // Remove from emailing set and add to recently sent
          setEmailingBusinesses(prev => {
            const newSet = new Set(prev);
            newSet.delete(business.id);
            return newSet;
          });
          
          // Add to recently sent for success animation
          setRecentlySentEmails(prev => new Set(prev).add(business.id));
          
          // Remove from recently sent after animation
          setTimeout(() => {
            setRecentlySentEmails(prev => {
              const newSet = new Set(prev);
              newSet.delete(business.id);
              return newSet;
            });
          }, 2000);
          
          // Small delay to show progression
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      // Clear selection after execution
      setSelectedBusinesses(new Set());
      
    } catch (error) {
      console.error('Failed to execute bulk operations:', error);
    } finally {
      setIsExecuting(false);
      setEmailingBusinesses(new Set());
    }
  };

  const sendEmailAutomatically = async (business: Business, email: string) => {
    // Mock: immediately mark as sent
    updateBusinessData(business.id, { emailStatus: 'sent' });
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 h-full flex items-center justify-center">
        <div className="flex items-center justify-center space-x-3">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          <span className="text-gray-600">Searching for businesses...</span>
        </div>
      </div>
    );
  }

  if (businesses.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center h-full flex items-center justify-center">
        <AlertCircle className="h-8 w-8 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600">No businesses found. Try a different search.</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              Found {businesses.length} businesses
            </h3>
            <div className="flex items-center space-x-4">
              {selectedBusinesses.size > 0 && (
                <span className="text-sm text-gray-600">
                  {selectedBusinesses.size} selected
                </span>
              )}
              <button
                onClick={handleSelectAll}
                className="flex items-center px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
              >
                <Check className="h-4 w-4 mr-1" />
                {selectedBusinesses.size === businesses.length ? 'Deselect All' : 'Select All'}
              </button>
              {selectedBusinesses.size > 0 && (
                <button
                  onClick={handleExecute}
                  disabled={isExecuting}
                  className="flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-md hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 transition-all duration-200 shadow-lg"
                >
                  {isExecuting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing Campaign...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Execute Campaign
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm border-separate border-spacing-x-[2px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                  <input
                    type="checkbox"
                    checked={selectedBusinesses.size === businesses.length && businesses.length > 0}
                    onChange={handleSelectAll}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-80">
                  Business
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-44">
                  Contact Info
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                  Audit Report
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-25">
                  Email 🔎
                </th>
                <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
                  Email 📤
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {businesses.map((business) => {
                const enrichedBusiness = getBusinessData(business);
                const loading = loadingStates[business.id];
                const isEmailing = emailingBusinesses.has(business.id);
                const isRecentlySent = recentlySentEmails.has(business.id);
                
                return (
                  <tr key={business.id} className={`hover:bg-gray-50 transition-colors ${selectedBusinesses.has(business.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-2 py-1">
                      <input
                        type="checkbox"
                        checked={selectedBusinesses.has(business.id)}
                        onChange={() => handleSelectBusiness(business.id)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <div>
                        <div className="text-sm font-medium text-gray-900 truncate leading-tight" title={business.name}>
                          {business.name}
                        </div>
                        <div className="text-xs text-gray-500 flex items-center mt-0.5">
                          <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                          <span className="truncate" title={business.address}>{business.address}</span>
                        </div>
                        <div className="flex items-center space-x-1 mt-1">
                          <a
                            href={`https://www.google.com/maps/place/?q=place_id:${business.placeId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                            title="View on Google Maps"
                          >
                            <Map className="h-3 w-3 mr-1" />
                            Maps
                          </a>
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5 truncate" title={`Place ID: ${business.placeId}`}>
                          ID: {business.placeId.substring(0, 20)}...
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-2 py-1">
                      <div className="space-y-0.5">
                        {business.website && (
                          <div className="flex items-center text-xs text-blue-600">
                            <Globe className="h-3 w-3 mr-1 flex-shrink-0" />
                            <a 
                              href={business.website} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="hover:underline flex items-center truncate"
                              title={business.website}
                            >
                              Site <ExternalLink className="h-3 w-3 ml-1 flex-shrink-0" />
                            </a>
                          </div>
                        )}
                        <div className="flex items-center text-xs text-gray-600">
                          <Phone className="h-3 w-3 mr-1 flex-shrink-0" />
                          <span className="truncate">{business.phone}</span>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-2 py-1">
                      {enrichedBusiness.auditReport ? (
                        <div className="space-y-1">
                          <div className="flex items-center text-xs text-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Ready
                          </div>
                          <div className="text-xs text-gray-600">
                            Score: {enrichedBusiness.auditReport.score}/100
                          </div>
                          <button
                            onClick={() => downloadReport(enrichedBusiness.auditReport.id, business.name)}
                            className="flex items-center text-xs text-blue-600 hover:text-blue-800"
                          >
                            <Download className="h-3 w-3 mr-0.5" />
                            PDF
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => generateAuditReport(business)}
                          disabled={loading === 'audit'}
                          className="flex items-center justify-center w-7 h-7 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50 transition-colors"
                          title="Generate Audit Report"
                        >
                          {loading === 'audit' ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <FileText className="h-3 w-3" />
                          )}
                        </button>
                      )}
                    </td>
                    
                    <td className="px-2 py-1">
                      {enrichedBusiness.emails && enrichedBusiness.emails.length > 0 ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center text-xs text-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {enrichedBusiness.emails.length} found
                          </div>
                          {enrichedBusiness.emails.slice(0, 1).map((email, index) => (
                            <div key={index} className="text-xs text-gray-600 truncate" title={email}>
                              {email}
                            </div>
                          ))}
                          {enrichedBusiness.emails.length > 1 && (
                            <div className="text-xs text-gray-400">
                              +{enrichedBusiness.emails.length - 1} more
                            </div>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => findEmails(business)}
                          disabled={loading === 'emails'}
                          className="flex items-center justify-center w-7 h-7 bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50 transition-colors"
                          title="Find Email Addresses"
                        >
                          {loading === 'emails' ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Mail className="h-3 w-3" />
                          )}
                        </button>
                      )}
                    </td>
                    
                    <td className="px-2 py-1 w-28">
                      {enrichedBusiness.emailStatus === 'sent' ? (
                        <div className="flex items-center text-xs text-green-600 bg-green-50 rounded px-2 py-1 font-medium">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Sent
                        </div>
                      ) : isEmailing ? (
                        <div className="flex items-center text-xs text-orange-700 bg-orange-50 rounded px-2 py-1 font-medium animate-pulse">
                          <Mail className="h-3 w-3 mr-1" />
                          Sending...
                        </div>
                      ) : (
                        <div className="flex items-center justify-center">
                          <button
                            onClick={() => handleSendEmail(business)}
                            disabled={!enrichedBusiness.emails || enrichedBusiness.emails.length === 0}
                            className="flex items-center justify-center w-8 h-8 bg-orange-100 text-orange-700 rounded-full hover:bg-orange-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
                            title="Send Outreach Email"
                          >
                            <Mail className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {emailModalOpen && selectedBusiness && (
        <EmailModal
          business={selectedBusiness}
          isOpen={emailModalOpen}
          onClose={() => setEmailModalOpen(false)}
          onEmailSent={handleEmailSent}
        />
      )}
    </>
  );
};

export default BusinessTable;