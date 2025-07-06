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
  Info,
  Shield,
  ShieldCheck,
  MapPin as LocationIcon
} from 'lucide-react';

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
  decisionMakers?: { name: string; title: string; email?: string; phone?: string; email_status?: string; linkedin_url?: string }[];
  addedAt: string;
  rating?: number;
  userRatingsTotal?: number;
  apolloStatus?: 'found' | 'not_found' | 'error';
}

interface BusinessTableProps {
  businesses: Business[];
  isLoading: boolean;
  onBusinessUpdate?: (business: Business) => void;
}

// Sorting helper
const getSortedBusinesses = (businesses: Business[], sortBy: string, sortOrder: 'asc' | 'desc', contactInfo: { [key: string]: { website: string | null, phone: string | null, emails?: string[], numLocations?: number, locationNames?: string[], loading: boolean } }) => {
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
  const [businessData, setBusinessData] = useState<{[key: string]: Business}>({});
  const [selectedBusinesses, setSelectedBusinesses] = useState<Set<string>>(new Set());
  const [isExecuting, setIsExecuting] = useState(false);
  const [isEnrichingPlaces, setIsEnrichingPlaces] = useState(false);
  const [isEnrichingApollo, setIsEnrichingApollo] = useState(false);
  const [colWidths, setColWidths] = useState({
    business: 220,
    category: 120,
    dm: 120,
    pdf: 90,
    discover: 90,
  });
  const resizingCol = useRef<keyof typeof colWidths | null>(null);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const pendingUpdates = useRef<{[key: string]: Business}>({});
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [contactInfo, setContactInfo] = useState<{ 
    [key: string]: { 
      website: string | null, 
      phone: string | null, 
      emails?: string[], 
      numLocations?: number,
      locationNames?: string[],
      loading: boolean 
    } 
  }>({});
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

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

  const findEmails = async (business: Business, useApolloAPI: boolean = false) => {
    updateLoadingState(business.id, 'emails');
    
    try {
      // Instead of using the separate emails endpoint, use the place-details endpoint with enrichment
      // This ensures consistency between individual and batch processing
      await fetchContactInfo(business.placeId, true, useApolloAPI);
    } catch (error) {
      console.error('Failed to find emails:', error);
    } finally {
      updateLoadingState(business.id, '');
    }
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
          // Pass false for Apollo API usage
          await findEmails(business, false);
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
    }
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

  const fetchContactInfo = async (placeId: string, enrichData: boolean = false, useApolloAPI: boolean = false) => {
    setContactInfo(prev => ({ ...prev, [placeId]: { website: null, phone: null, emails: [], numLocations: undefined, locationNames: [], loading: true } }));
    try {
      const url = `/api/place-details/${placeId}${enrichData ? `?enrich=true${useApolloAPI ? '&apollo=true' : ''}` : ''}`;
      console.log(`[Contact Info] Fetching from: ${url}`);
      const res = await fetch(url);
      const data = await res.json();
      console.log(`[Contact Info] Received data for ${placeId}:`, data);
      
      // Extract website info, check if it's available from business data if not in response
      let website = data.website || null;
      const business = businesses.find(b => b.placeId === placeId);
      if (!website && business?.website) {
        website = business.website;
        console.log(`[Contact Info] Using website from business data for ${placeId}:`, website);
      }
      
      setContactInfo(prev => ({
        ...prev,
        [placeId]: {
          website: website,
          phone: data.formatted_phone_number || null,
          emails: data.emails || [],
          numLocations: data.numLocations,
          locationNames: data.locationNames || [],
          loading: false
        }
      }));
      
      // Also update the emails and decision makers in businessData
      if (business) {
        updateBusinessData(business.id, { 
          emails: data.emails || [],
          decisionMakers: data.decisionMakers || [],
          website: website || business.website // Preserve existing website if available
        });
      }
    } catch (error) {
      console.error(`[Contact Info] Error fetching data for ${placeId}:`, error);
      setContactInfo(prev => ({ ...prev, [placeId]: { website: null, phone: null, emails: [], numLocations: undefined, locationNames: [], loading: false } }));
    }
  };

  // Helper function to safely check and get location names
  const getLocationNames = (placeId: string): string[] => {
    const info = contactInfo[placeId];
    if (!info || !info.locationNames) return [];
    return info.locationNames;
  };
  
  // Helper function to check if a business has multiple locations
  const hasMultipleLocations = (placeId: string): boolean => {
    const info = contactInfo[placeId];
    return info?.numLocations !== undefined && info.numLocations > 1;
  };

  // Add a function to toggle tooltip visibility
  const toggleTooltip = (placeId: string | null) => {
    setActiveTooltip(activeTooltip === placeId ? null : placeId);
  };

  // Helper method to get the best website URL for a business
  const getBestWebsiteUrl = (business: Business): string | null => {
    console.log(`[Website Debug] Looking for website for business: ${business.name} (${business.placeId})`);
    
    // First check in enriched contact info
    const contactInfoWeb = contactInfo[business.placeId]?.website;
    if (contactInfoWeb) {
      console.log(`[Website Debug] Found website in contactInfo: ${contactInfoWeb}`);
      return contactInfoWeb;
    }
    
    // Then check business data from state
    const businessDataWeb = businessData[business.id]?.website;
    if (businessDataWeb) {
      console.log(`[Website Debug] Found website in businessData: ${businessDataWeb}`);
      return businessDataWeb;
    }
    
    // Finally fall back to original business object
    console.log(`[Website Debug] Falling back to original business.website: ${business.website || 'null'}`);
    return business.website;
  };

  // Add a function to enrich places data
  const enrichPlacesData = async (business: Business) => {
    updateLoadingState(business.id, 'enrich');
    try {
      // For Google Places enrichment, we do want to update the contact info
      setContactInfo(prev => ({ ...prev, [business.placeId]: { ...(prev[business.placeId] || {}), loading: true } }));
      
      const url = `/api/place-details/${business.placeId}?enrich=true`;
      console.log(`[Places Enrich] Fetching from: ${url}`);
      const res = await fetch(url);
      const data = await res.json();
      console.log(`[Places Enrich] Received data for ${business.placeId}:`, data);
      
      // Extract website info, check if it's available from business data if not in response
      let website = data.website || null;
      if (!website && business?.website) {
        website = business.website;
        console.log(`[Places Enrich] Using website from business data for ${business.placeId}:`, website);
      }
      
      // Update contact info with Google Places data
      setContactInfo(prev => ({
        ...prev,
        [business.placeId]: {
          website: website,
          phone: data.formatted_phone_number || null,
          emails: data.emails || [],
          numLocations: data.numLocations,
          locationNames: data.locationNames || [],
          loading: false
        }
      }));
      
      // Also update the business data
      updateBusinessData(business.id, { 
        emails: data.emails || [],
        website: website || business.website // Preserve existing website if available
      });
    } catch (error) {
      console.error('Failed to enrich places data:', error);
      setContactInfo(prev => ({ ...prev, [business.placeId]: { ...(prev[business.placeId] || {}), loading: false } }));
    } finally {
      updateLoadingState(business.id, '');
    }
  };

  // Update the enrichWithApollo function to handle no results
  const enrichWithApollo = async (business: Business) => {
    updateLoadingState(business.id, 'apollo');
    try {
      // Don't set the contact info loading state when using Apollo
      const url = `/api/place-details/${business.placeId}?enrich=true&apollo=true`;
      console.log(`[Apollo Enrich] Fetching from: ${url}`);
      const res = await fetch(url);
      const data = await res.json();
      console.log(`[Apollo Enrich] Received data for ${business.placeId}:`, data);
      
      // Update business data with Apollo enrichment results without affecting contact info display
      if (business) {
        const decisionMakers = data.decisionMakers || [];
        updateBusinessData(business.id, { 
          decisionMakers,
          apolloStatus: decisionMakers.length > 0 ? 'found' : 'not_found'
        });
      }
    } catch (error) {
      console.error('Failed to enrich with Apollo:', error);
      updateBusinessData(business.id, { 
        apolloStatus: 'error'
      });
    } finally {
      updateLoadingState(business.id, '');
    }
  };

  // Add back the batchEnrichPlaces function
  const batchEnrichPlaces = async () => {
    if (selectedBusinesses.size === 0) return;
    
    setIsEnrichingPlaces(true);
    
    try {
      const selectedBusinessList = businesses.filter(b => selectedBusinesses.has(b.id));
      
      // Enrich each selected business with Google Places data
      for (const business of selectedBusinessList) {
        updateLoadingState(business.id, 'enrich');
        await enrichPlacesData(business);
        // Small delay to show progression
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
    } catch (error) {
      console.error('Failed to batch enrich with Google Places:', error);
    } finally {
      setIsEnrichingPlaces(false);
    }
  };

  // Update the batchEnrichApollo function to handle no results
  const batchEnrichApollo = async () => {
    if (selectedBusinesses.size === 0) return;
    
    setIsEnrichingApollo(true);
    
    try {
      const selectedBusinessList = businesses.filter(b => selectedBusinesses.has(b.id));
      
      // Enrich each selected business with Apollo data
      for (const business of selectedBusinessList) {
        updateLoadingState(business.id, 'apollo');
        await enrichWithApollo(business);
        // Small delay to show progression
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
    } catch (error) {
      console.error('Failed to batch enrich with Apollo:', error);
    } finally {
      setIsEnrichingApollo(false);
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
                <div className="flex items-center space-x-2">
                  <button
                    onClick={batchEnrichPlaces}
                    disabled={isEnrichingPlaces || isEnrichingApollo || isExecuting}
                    className="flex items-center px-3 py-1.5 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 disabled:opacity-50 transition-all duration-200"
                    title="Enrich selected businesses with Google Places data"
                  >
                    {isEnrichingPlaces ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Map className="h-4 w-4 mr-1" />
                    )}
                    Enrich Places
                  </button>
                  
                  <button
                    onClick={batchEnrichApollo}
                    disabled={isEnrichingPlaces || isEnrichingApollo || isExecuting}
                    className="flex items-center px-3 py-1.5 bg-purple-100 text-purple-700 rounded-md hover:bg-purple-200 disabled:opacity-50 transition-all duration-200"
                    title="Find decision makers with Apollo for selected businesses"
                  >
                    {isEnrichingApollo ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Shield className="h-4 w-4 mr-1" />
                    )}
                    Find Apollo DMs
                  </button>
                  
                  <button
                    onClick={handleExecute}
                    disabled={isEnrichingPlaces || isEnrichingApollo || isExecuting}
                    className="flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-md hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 transition-all duration-200 shadow-lg"
                  >
                    {isExecuting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Execute Campaign
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="w-full min-w-[900px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                  <div className="flex justify-center items-center">
                    <input 
                      type="checkbox" 
                      checked={selectedBusinesses.size === businesses.length && businesses.length > 0} 
                      onChange={handleSelectAll} 
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" 
                    />
                  </div>
                </th>
                <th style={{ width: 205 }} className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer whitespace-normal" onClick={() => handleSort('name')}>
                  BUSINESS
                  <span className="ml-1">{sortBy === 'name' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</span>
                </th>
                <th style={{ width: 150 }} className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Contact Info</th>
                <th style={{ width: 80 }} className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer whitespace-nowrap" onClick={() => handleSort('numLocations')}>
                  # Locations
                  <span className="ml-1">{sortBy === 'numLocations' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</span>
                </th>
                <th style={{ width: 120 }} className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-10">Website ✉️</th>
                <th style={{ width: 120 }} className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-10">Apollo ✉️</th>
                <th style={{ width: 80 }} className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-10">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedBusinesses.map((business) => {
                const enrichedBusiness = getBusinessData(business);
                const loading = loadingStates[business.id];
                return (
                  <tr key={business.id} className={`hover:bg-gray-50 transition-colors ${selectedBusinesses.has(business.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-3 py-2">
                      <div className="flex justify-center items-center">
                        <input
                          type="checkbox"
                          checked={selectedBusinesses.has(business.id)}
                          onChange={() => handleSelectBusiness(business.id)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                      </div>
                    </td>
                    <td style={{ width: 205 }} className="px-2 py-1 max-w-[205px] align-top">
                      <div className="flex flex-col space-y-1">
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
                        <div className="text-xs text-gray-600">
                          {enrichedBusiness.rating !== undefined && enrichedBusiness.rating !== null ? (
                            <>
                              ⭐ {enrichedBusiness.rating.toFixed(1)}
                              {enrichedBusiness.userRatingsTotal !== undefined && enrichedBusiness.userRatingsTotal !== null && (
                                <> - 📊 {enrichedBusiness.userRatingsTotal}</>
                              )}
                            </>
                          ) : (
                            <span className="text-gray-400">No rating</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ width: 150 }} className="px-2 py-1 text-xs">
                      <div className="flex flex-col gap-1 items-center justify-center">
                        {contactInfo[business.placeId]?.loading ? (
                          <span className="flex items-center text-xs text-gray-400"><Loader2 className="h-4 w-4 animate-spin mr-1" />Loading...</span>
                        ) : contactInfo[business.placeId] ? (
                          <>
                            {getBestWebsiteUrl(business) ? (
                              <a
                                href={getBestWebsiteUrl(business) || undefined}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center text-xs text-blue-600 hover:text-blue-800"
                              >
                                <Globe className="h-4 w-4 mr-1 inline" />{getDomain(getBestWebsiteUrl(business))}
                              </a>
                            ) : (
                              <span className="flex items-center text-xs text-gray-400"><Globe className="h-4 w-4 mr-1 inline" />No site</span>
                            )}
                            {contactInfo[business.placeId].phone ? (
                              <span className="flex items-center text-xs text-gray-700"><Phone className="h-4 w-4 mr-1 inline" />{contactInfo[business.placeId].phone}</span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </div>
                    </td>
                    <td style={{ width: 80 }} className="px-2 py-1 text-xs text-center">
                      {typeof contactInfo[business.placeId]?.numLocations === 'number' ? (
                        <div className="relative">
                          {hasMultipleLocations(business.placeId) ? (
                            <div className="relative inline-block">
                              <button 
                                className="flex items-center justify-center space-x-1 text-blue-600 hover:text-blue-800 hover:underline" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleTooltip(business.placeId);
                                }}
                              >
                                <span>{contactInfo[business.placeId]?.numLocations}</span>
                                <LocationIcon className="h-3 w-3" />
                              </button>
                              
                              {activeTooltip === business.placeId && getLocationNames(business.placeId).length > 0 && (
                                <div className="absolute left-0 z-50 mt-2 bg-white rounded-md shadow-lg py-2 px-3 text-left border border-gray-200 w-48 sm:w-64 whitespace-normal">
                                  <div className="text-sm font-medium text-gray-800 mb-1">Locations:</div>
                                  <ul className="list-disc list-inside text-xs space-y-1 text-gray-700 max-h-40 overflow-y-auto">
                                    {getLocationNames(business.placeId).map((location, idx) => (
                                      <li key={idx} className="truncate" title={location}>{location}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          ) : (
                            contactInfo[business.placeId]?.numLocations
                          )}
                        </div>
                      ) : '-'}
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
                    <td style={{ width: 120 }} className="px-2 py-1 text-xs">
                      {Array.isArray(enrichedBusiness.decisionMakers) && enrichedBusiness.decisionMakers.length > 0 ? (
                        <div className="space-y-1">
                          {enrichedBusiness.decisionMakers.map((dm, idx) => (
                            <div key={idx} className="space-y-0.5">
                              <div className="flex items-center text-xs text-gray-800">
                                <span className="truncate" title={`${dm.name} - ${dm.title}`}>{dm.name}</span>
                                {dm.linkedin_url && (
                                  <>
                                    <span className="mx-1 text-gray-400">-</span>
                                    <a
                                      href={dm.linkedin_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:underline flex items-center"
                                      title="View LinkedIn Profile"
                                    >
                                      <ExternalLink className="h-3 w-3 mr-1" />
                                      LinkedIn
                                    </a>
                                  </>
                                )}
                                {dm.email && !dm.email.includes('email_not_unlocked') && !dm.email.includes('not_available') && (
                                  <>
                                    <span className="mx-1 text-gray-400">-</span>
                                    <span className="text-gray-600">{dm.email}</span>
                                    {dm.email_status === 'verified' ? (
                                      <ShieldCheck className="h-3 w-3 ml-1 text-green-600" />
                                    ) : dm.email_status === 'unverified' ? (
                                      <Shield className="h-3 w-3 ml-1 text-orange-600" />
                                    ) : null}
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : enrichedBusiness.apolloStatus === 'not_found' ? (
                        <span className="text-xs text-gray-500 italic">No DMs found in Apollo</span>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td style={{ width: 80 }} className="px-2 py-1 text-xs">
                      <div className="flex items-center justify-center space-x-1">
                        {/* Google Places Enrich Button */}
                        <button
                          onClick={() => enrichPlacesData(business)}
                          disabled={loading === 'enrich'}
                          className="flex items-center justify-center w-6 h-6 bg-blue-100 hover:bg-blue-200 rounded-full text-blue-600 hover:text-blue-800 transition-colors disabled:opacity-50"
                          title="Enrich Google Places"
                        >
                          {loading === 'enrich' ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Map className="h-3 w-3" />
                          )}
                        </button>
                        
                        {/* Apollo Enrich Button */}
                        <button
                          onClick={() => enrichWithApollo(business)}
                          disabled={loading === 'apollo'}
                          className="flex items-center justify-center w-6 h-6 bg-purple-100 hover:bg-purple-200 rounded-full text-purple-600 hover:text-purple-800 transition-colors disabled:opacity-50"
                          title="Enrich with Apollo"
                        >
                          {loading === 'apollo' ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Shield className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

export default BusinessTable;