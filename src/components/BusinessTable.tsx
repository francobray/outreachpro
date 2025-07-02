import React, { useState, useRef, useEffect } from 'react';
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
  Play,
  Info
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
  category?: string;
  types?: string[];
  decisionMakers?: { name: string; title: string; email?: string; phone?: string }[];
  addedAt: string;
  rating?: number;
  userRatingsTotal?: number;
}

interface BusinessTableProps {
  businesses: Business[];
  isLoading: boolean;
  onBusinessUpdate?: (business: Business) => void;
}

// Sorting helper
const getSortedBusinesses = (businesses: Business[], sortBy: string, sortOrder: 'asc' | 'desc', contactInfo: { [key: string]: { website: string | null, phone: string | null, emails?: string[], numLocations?: number, loading: boolean } }) => {
  const sorted = [...businesses];
  sorted.sort((a, b) => {
    let aValue: any;
    let bValue: any;
    
    if (sortBy === 'numLocations') {
      aValue = contactInfo[a.placeId]?.numLocations;
      bValue = contactInfo[b.placeId]?.numLocations;
    } else {
      aValue = a[sortBy as keyof Business];
      bValue = b[sortBy as keyof Business];
    }
    
    if (sortBy === 'name') {
      aValue = (aValue as string)?.toLowerCase() || '';
      bValue = (bValue as string)?.toLowerCase() || '';
    }
    
    if (aValue === undefined || aValue === null) return 1;
    if (bValue === undefined || bValue === null) return -1;
    if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });
  return sorted;
};

// Add a utility function to extract the domain from a URL
function getDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
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
  const [colWidths, setColWidths] = useState({
    business: 220,
    category: 120,
    dm: 120,
    pdf: 90,
    discover: 90,
    delivery: 90,
  });
  const resizingCol = useRef<keyof typeof colWidths | null>(null);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const pendingUpdates = useRef<{[key: string]: Business}>({});
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [contactInfo, setContactInfo] = useState<{ [key: string]: { website: string | null, phone: string | null, emails?: string[], numLocations?: number, loading: boolean } }>({});

  // Auto-fetch contact info for all businesses when they're loaded
  useEffect(() => {
    if (businesses.length > 0) {
      businesses.forEach(business => {
        if (!contactInfo[business.placeId] && !contactInfo[business.placeId]?.loading) {
          fetchContactInfo(business.placeId);
        }
      });
    }
  }, [businesses]);

  const sortedBusinesses = getSortedBusinesses(businesses, sortBy, sortOrder, contactInfo);

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const updateLoadingState = (businessId: string, state: string) => {
    setLoadingStates(prev => ({ ...prev, [businessId]: state }));
  };

  const updateBusinessData = (businessId: string, updates: Partial<Business>) => {
    const base = businesses.find(b => b.id === businessId);
    if (!base) return;

    const updatedBusiness = {
      ...base,
      ...updates,
      emails: (updates.emails ?? base.emails ?? []) as string[],
    } as Business;

    // Store the update for later
    pendingUpdates.current[businessId] = updatedBusiness;

    // Update local state
    setBusinessData(prev => ({
      ...prev,
      [businessId]: { ...prev[businessId], ...updates }
    }));
  };

  // Use effect to handle parent updates after state changes
  useEffect(() => {
    if (onBusinessUpdate && Object.keys(pendingUpdates.current).length > 0) {
      const updates = { ...pendingUpdates.current };
      pendingUpdates.current = {};
      
      Object.values(updates).forEach(business => {
        onBusinessUpdate(business);
      });
    }
  }, [businessData, onBusinessUpdate]);

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
      updateBusinessData(business.id, {
        emails: data.emails,
        decisionMakers: data.decisionMakers
      });
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

  const startResizing = (e: React.MouseEvent<HTMLDivElement, MouseEvent>, col: keyof typeof colWidths) => {
    resizingCol.current = col;
    startX.current = e.clientX;
    startWidth.current = colWidths[col];
    window.addEventListener('mousemove', onMouseMove as any);
    window.addEventListener('mouseup', stopResizing);
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!resizingCol.current) return;
    const diff = e.clientX - startX.current;
    setColWidths(widths => ({
      ...widths,
      [String(resizingCol.current)]: Math.max(startWidth.current + diff, 50)
    }));
  };

  const stopResizing = () => {
    resizingCol.current = null;
    window.removeEventListener('mousemove', onMouseMove as any);
    window.removeEventListener('mouseup', stopResizing);
  };

  const fetchContactInfo = async (placeId: string) => {
    setContactInfo(prev => ({ ...prev, [placeId]: { website: null, phone: null, emails: [], numLocations: undefined, loading: true } }));
    try {
      const res = await fetch(`/api/place-details/${placeId}`);
      const data = await res.json();
      setContactInfo(prev => ({
        ...prev,
        [placeId]: {
          website: data.website || null,
          phone: data.formatted_phone_number || null,
          emails: data.emails || [],
          numLocations: data.numLocations,
          loading: false
        }
      }));
      // Also update the emails in businessData so the Emails column is populated
      const business = businesses.find(b => b.placeId === placeId);
      if (business) {
        updateBusinessData(business.id, { emails: data.emails || [] });
      }
    } catch {
      setContactInfo(prev => ({ ...prev, [placeId]: { website: null, phone: null, emails: [], numLocations: undefined, loading: false } }));
    }
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

        <div className="overflow-x-auto w-full">
          <table className="w-full min-w-[900px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                  <input type="checkbox" checked={selectedBusinesses.size === businesses.length && businesses.length > 0} onChange={handleSelectAll} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                </th>
                <th style={{ width: 205 }} className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer whitespace-normal" onClick={() => handleSort('name')}>
                  BUSINESS
                  <span className="ml-1">{sortBy === 'name' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</span>
                </th>
                <th style={{ width: 150 }} className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Contact Info</th>
                <th style={{ width: 120 }} className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">Emails</th>
                <th style={{ width: 80 }} className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer whitespace-nowrap" onClick={() => handleSort('numLocations')}>
                  # Locations
                  <span className="ml-1">{sortBy === 'numLocations' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</span>
                </th>
                <th style={{ width: 80 }} className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer whitespace-nowrap" onClick={() => handleSort('rating')}>
                  ⭐
                  <span className="ml-1">{sortBy === 'rating' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</span>
                </th>
                <th style={{ width: 80 }} className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer whitespace-nowrap" onClick={() => handleSort('userRatingsTotal')}>
                  📊 Reviews
                  <span className="ml-1">{sortBy === 'userRatingsTotal' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</span>
                </th>
                <th style={{ width: colWidths.delivery }} className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-15">📤</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedBusinesses.map((business) => {
                const enrichedBusiness = getBusinessData(business);
                const loading = loadingStates[business.id];
                const isEmailing = emailingBusinesses.has(business.id);
                const isRecentlySent = recentlySentEmails.has(business.id);
                return (
                  <tr key={business.id} className={`hover:bg-gray-50 transition-colors ${selectedBusinesses.has(business.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedBusinesses.has(business.id)}
                        onChange={() => handleSelectBusiness(business.id)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </td>
                    <td style={{ width: 205 }} className="px-2 py-1 max-w-[205px] align-top">
                      <div className="flex items-center space-x-2">
                        <a
                          href={`https://www.google.com/maps/place/?q=place_id:${business.placeId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-blue-700 hover:underline leading-tight break-words max-w-[170px]"
                          title={business.name}
                        >
                          {business.name}
                        </a>
                        <a
                          href={`https://www.google.com/maps/place/?q=place_id:${business.placeId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1 flex items-center justify-center w-6 h-6 bg-gray-100 hover:bg-blue-100 rounded-full text-blue-600 hover:text-blue-800 transition-colors"
                          title="Open in Google Maps"
                          tabIndex={-1}
                          style={{ minWidth: 24, minHeight: 24 }}
                        >
                          <ExternalLink className="h-4 w-4 inline text-blue-600" />
                        </a>
                      </div>
                    </td>
                    <td style={{ width: 150 }} className="px-2 py-1 text-xs">
                      <div className="flex flex-col gap-1 items-center justify-center">
                        {contactInfo[business.placeId]?.loading ? (
                          <span className="flex items-center text-xs text-gray-400"><Loader2 className="h-4 w-4 animate-spin mr-1" />Loading...</span>
                        ) : contactInfo[business.placeId] ? (
                          <>
                            {contactInfo[business.placeId].website ? (
                              <a
                                href={contactInfo[business.placeId].website || undefined}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center text-xs text-blue-600 hover:text-blue-800"
                              >
                                <Globe className="h-4 w-4 mr-1 inline" />{getDomain(contactInfo[business.placeId].website)}
                              </a>
                            ) : (
                              <span className="flex items-center text-xs text-gray-400"><Globe className="h-4 w-4 mr-1 inline" />No site</span>
                            )}
                            {contactInfo[business.placeId].phone ? (
                              <span className="flex items-center text-xs text-gray-700"><Phone className="h-4 w-4 mr-1 inline" />{contactInfo[business.placeId].phone}</span>
                            ) : null}
                          </>
                        ) : (
                          <div className="flex justify-center">
                            <button
                              className="flex items-center justify-center w-7 h-7 bg-gray-100 hover:bg-blue-100 rounded-full text-blue-600 hover:text-blue-800 transition-colors"
                              title="Fetch contact info"
                              onClick={() => { console.log('Phone button clicked for', business.placeId); fetchContactInfo(business.placeId); }}
                            >
                              <Phone className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ width: 120 }} className="px-2 py-1 text-xs">
                      {Array.isArray(enrichedBusiness.emails) && enrichedBusiness.emails.length > 0 ? (
                        <div className="space-y-0.5">
                          {enrichedBusiness.emails.map((email, idx) => (
                            <div key={idx} className="flex items-center text-xs text-gray-800">
                              <Mail className="h-3 w-3 mr-1 text-green-600" />
                              <span className="truncate" title={email}>{email}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td style={{ width: 80 }} className="px-2 py-1 text-xs text-center">
                      {typeof contactInfo[business.placeId]?.numLocations === 'number' ? contactInfo[business.placeId].numLocations : '-'}
                    </td>
                    <td style={{ width: 80 }} className="px-2 py-1 text-xs">
                      {enrichedBusiness.rating !== undefined && enrichedBusiness.rating !== null
                        ? enrichedBusiness.rating.toFixed(1)
                        : <span className="text-xs text-gray-400">-</span>}
                    </td>
                    <td style={{ width: 80 }} className="px-2 py-1 text-xs">
                      {enrichedBusiness.userRatingsTotal !== undefined && enrichedBusiness.userRatingsTotal !== null
                        ? enrichedBusiness.userRatingsTotal
                        : <span className="text-xs text-gray-400">-</span>}
                    </td>
                    <td style={{ width: colWidths.delivery }} className="px-2 py-1 w-28 text-xs">
                      {enrichedBusiness.emailStatus !== 'pending' ? (
                        enrichedBusiness.emailStatus === 'sent' ? (
                          <div className="flex items-center text-xs text-green-600 bg-green-50 rounded px-2 py-1 font-medium">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Sent
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
                        )
                      ) : null}
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