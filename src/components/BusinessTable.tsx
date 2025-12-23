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
  MapPin as LocationIcon,
  Star,
  Send,
  Calculator,
  X
} from 'lucide-react';

import { Business, DecisionMaker } from '../types';
import EmailModal from './EmailModal';
import AlertModal from './AlertModal';

interface BusinessTableProps {
  businesses: Business[];
  isLoading: boolean;
  onSelectionChange: (selected: Business[]) => void;
  onCreateCampaign: () => void;
  onBusinessUpdate?: (business: Business) => void;
  emailTemplates: any[]; // Replace with a proper EmailTemplate type
}

// Sorting helper
const getSortedBusinesses = (businesses: Business[], sortBy: string, sortOrder: 'asc' | 'desc', contactInfo: { [key: string]: { website: string | null, phone: string | null, emails?: string[], numLocations?: number, locationNames?: string[], loading: boolean, usedPuppeteer?: boolean, websiteStatus?: 'ok' | 'timeout' | 'not_found' | 'error' | 'enotfound'; } }) => {
  const sorted = [...businesses];
  sorted.sort((a, b) => {
    let aValue: any;
    let bValue: any;
    
    if (sortBy === 'numLocations') {
      aValue = contactInfo[a.placeId]?.numLocations;
      bValue = contactInfo[b.placeId]?.numLocations;
    } else if (sortBy === 'graderScore') {
      aValue = a.graderScore ?? -1;
      bValue = b.graderScore ?? -1;
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

const BusinessTable: React.FC<BusinessTableProps> = ({ businesses, isLoading, onSelectionChange, onCreateCampaign, onBusinessUpdate, emailTemplates }) => {
  const [loadingStates, setLoadingStates] = useState<{[key: string]: string}>({});
  const [businessData, setBusinessData] = useState<{[key: string]: Business}>({});
  const [selectedBusinesses, setSelectedBusinesses] = useState<Set<string>>(new Set());
  const [isExecuting, setIsExecuting] = useState(false);
  const [isEnrichingPlaces, setIsEnrichingPlaces] = useState(false);
  const [isEnrichingApollo, setIsEnrichingApollo] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [selectedBusinessForEmail, setSelectedBusinessForEmail] = useState<Business | null>(null);
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'info' | 'warning' | 'error' | 'success' | 'confirm';
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });
  const [progressModal, setProgressModal] = useState<{
    isOpen: boolean;
    stage: 'enriching' | 'calculating' | 'complete';
    businessName: string;
    midmarketScore?: number;
    independentScore?: number;
  }>({
    isOpen: false,
    stage: 'enriching',
    businessName: ''
  });
  const [databaseBusinesses, setDatabaseBusinesses] = useState<{[key: string]: any}>({});
  const [isCheckingDatabase, setIsCheckingDatabase] = useState(false);
  const [colWidths, setColWidths] = useState({
    business: 220,
    website: 150,
    phone: 120,
    emails: 200,
    locations: 120,
    grader: 100,
    icpScore: 100,
    actions: 140
  });
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [contactInfo, setContactInfo] = useState<{[key: string]: { website: string | null, phone: string | null, emails?: string[], numLocations?: number, locationNames?: string[], loading: boolean, usedPuppeteer?: boolean, websiteStatus?: 'ok' | 'timeout' | 'not_found' | 'error' | 'enotfound'; } }>({});
  const [tooltipPlaceId, setTooltipPlaceId] = useState<string | null>(null);
  const [icpBreakdownModal, setIcpBreakdownModal] = useState<{
    isOpen: boolean;
    type: 'midmarket' | 'independent' | null;
    breakdown: any;
    score: number | null;
    businessName: string;
    category: string | null;
    website: string | null;
  }>({
    isOpen: false,
    type: null,
    breakdown: null,
    score: null,
    businessName: '',
    category: null,
    website: null
  });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeColumn, setResizeColumn] = useState<keyof typeof colWidths | null>(null);

  // Check database for enriched data when businesses are loaded
  useEffect(() => {
    if (businesses.length > 0 && !isLoading) {
      checkDatabaseForBusinesses();
    }
  }, [businesses, isLoading]);

  // Handle ESC key to close modals
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (alertModal.isOpen) {
          setAlertModal({ ...alertModal, isOpen: false });
        }
        if (icpBreakdownModal.isOpen) {
          setIcpBreakdownModal({ ...icpBreakdownModal, isOpen: false });
        }
        if (progressModal.isOpen && progressModal.stage === 'complete') {
          setProgressModal({ ...progressModal, isOpen: false });
        }
      }
    };

    document.addEventListener('keydown', handleEscKey);
    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [alertModal, icpBreakdownModal, progressModal]);

  const resizingCol = useRef<keyof typeof colWidths | null>(null);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const pendingUpdates = useRef<{[key: string]: Business}>({});
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [isLocationsModalOpen, setIsLocationsModalOpen] = useState(false);
  const [selectedLocationsBusiness, setSelectedLocationsBusiness] = useState<Business | null>(null);

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
      ...businessData[businessId],
      ...updates,
    } as Business;

    pendingUpdates.current[businessId] = updatedBusiness;

    setBusinessData(prev => ({
      ...prev,
      [businessId]: updatedBusiness
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
    const newSelectedIds = new Set(selectedBusinesses);
    if (newSelectedIds.has(businessId)) {
      newSelectedIds.delete(businessId);
    } else {
      newSelectedIds.add(businessId);
    }
    setSelectedBusinesses(newSelectedIds);
    
    const selected = businesses.filter(b => newSelectedIds.has(b.id));
    onSelectionChange(selected);
  };

  const handleSelectAll = () => {
    let newSelectedIds: Set<string>;
    if (selectedBusinesses.size === businesses.length) {
      newSelectedIds = new Set();
    } else {
      newSelectedIds = new Set(businesses.map(b => b.id));
    }
    setSelectedBusinesses(newSelectedIds);

    const selected = businesses.filter(b => newSelectedIds.has(b.id));
    onSelectionChange(selected);
  };

  const openEmailModal = (business: Business) => {
    setSelectedBusinessForEmail(business);
    setIsEmailModalOpen(true);
  };

  const handleSendEmail = async (dm: DecisionMaker, templateId: string, graderData?: any, emailType: 'test' | 'real' = 'real') => {
    const template = emailTemplates.find(t => t.id === templateId);
    if (!template || !selectedBusinessForEmail) {
      console.error('Template or business not found');
      return;
    }

    // Get enriched business data
    const enrichedBusiness = getBusinessData(selectedBusinessForEmail);
    
    // Get location data for city/state
    const location = enrichedBusiness.locations?.[0];
    const cityState = location?.address ? 
      location.address.split(',').slice(-2).join(',').trim() : 
      'Austin, TX'; // Default fallback

    const variables: { [key: string]: string } = {
      '{{LEAD_NAME}}': dm.name,
      '{{BUSINESS_NAME}}': selectedBusinessForEmail.name,
      '{{BUSINESS_CITY_STATE}}': cityState,
      // Use grader data if available, otherwise use defaults
      '{{REVENUE_LOSS}}': graderData?.revenueLoss || '$5,000',
      '{{COMPETITOR_LIST}}': graderData?.competitors?.join(', ') || 'Competitor A, Competitor B',
      '{{HEALTH_GRADE}}': graderData?.healthGrade || 'B+',
      '{{SEARCH_RESULTS_SCORE}}': graderData?.searchResultsScore || '85',
      '{{SEARCH_RESULTS_GRADE}}': graderData?.searchResultsGrade || 'A',
      '{{WEBSITE_EXPERIENCE_SCORE}}': graderData?.websiteExperienceScore || '75',
      '{{LOCAL_LISTINGS_SCORE}}': graderData?.localListingsScore || '90',
      '{{GOOGLE_RATING}}': enrichedBusiness.rating ? `${enrichedBusiness.rating}/5` : '4.5/5',
      '{{REVIEW_COUNT}}': enrichedBusiness.userRatingsTotal?.toString() || '150',
      '{{BUSINESS_CATEGORY}}': enrichedBusiness.category || 'Restaurant',
      '{{YEARLY_REVENUE_LOSS}}': graderData?.yearlyRevenueLoss || '$60,000'
    };

    let subject = template.subject;
    let body = template.body;

    for (const [key, value] of Object.entries(variables)) {
      subject = subject.split(key).join(value || '');
      body = body.split(key).join(value || '');
    }

    const htmlBody = body.replace(/\n/g, '<br />');
    
    try {
      const response = await fetch('http://localhost:3001/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: dm.email,
          subject: subject,
          html: htmlBody,
          businessId: selectedBusinessForEmail.placeId,
          businessName: selectedBusinessForEmail.name,
          decisionMakerId: dm.id || 'unknown',
          decisionMakerName: dm.name,
          decisionMakerEmail: dm.email,
          templateId: template.id,
          templateName: template.name,
          emailType: emailType
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send email');
      }

      const result = await response.json();
      console.log('Email sent successfully:', result);
      // Here you could update the decision maker's email_status to 'sent'
    } catch (error) {
      console.error('Error sending email:', error);
      throw error; // Re-throw to be caught in the modal
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
    if (selectedBusinesses.size === 0) {
      setAlertModal({
        isOpen: true,
        title: 'No Businesses Selected',
        message: 'Please select at least one business.',
        type: 'warning'
      });
      return;
    }
    onCreateCampaign();
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
    setContactInfo(prev => ({ ...prev, [placeId]: { ...prev[placeId], loading: true } }));
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
          loading: false,
          usedPuppeteer: data.usedPuppeteer || false,
          websiteStatus: data.website_status || 'ok'
        }
      }));
      
      // Also update the emails and decision makers in businessData
      if (business) {
        updateBusinessData(business.id, { 
          locations: business.locations.map(loc => loc.id === placeId ? {
            ...loc,
            website: website || loc.website,
            emails: data.emails || [],
            websiteStatus: data.website_status || 'ok'
          } : loc),
          decisionMakers: data.decisionMakers || [],
          apolloStatus: data.decisionMakers && data.decisionMakers.length > 0 ? 'found' : business.apolloStatus
        });
      }
    } catch (error) {
      console.error(`[Contact Info] Error fetching data for ${placeId}:`, error);
      setContactInfo(prev => ({ ...prev, [placeId]: { ...prev[placeId], loading: false } }));
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

  // Helper function to check if a business has enriched Google Places data from database
  const hasEnrichedPlacesData = (business: Business): boolean => {
    const dbBusiness = databaseBusinesses[business.placeId];
    if (!dbBusiness) return false;
    
    // Check if the business was actually enriched (not just has basic Google Places data)
    return !!(dbBusiness.enrichedAt);
  };

  // Helper function to check if a business has enriched Apollo data from database
  const hasEnrichedApolloData = (business: Business): boolean => {
    const dbBusiness = databaseBusinesses[business.placeId];
    if (!dbBusiness) return false;
    
    // Check if Apollo contacts (decision makers) are already found
    // Also check if Apollo was already attempted (decisionMakers field exists, even if empty)
    return !!(dbBusiness.decisionMakers && dbBusiness.decisionMakers.length > 0);
  };

  // Helper function to check if Apollo was already attempted (regardless of results)
  const hasApolloBeenAttempted = (business: Business): boolean => {
    const dbBusiness = databaseBusinesses[business.placeId];
    if (!dbBusiness) return false;
    
    // Check if Apollo was explicitly attempted using the new field
    // For existing records without this field, treat as never attempted
    const attempted = dbBusiness.apolloAttempted === true;
    return attempted;
  };

  // Add a function to toggle tooltip visibility
  const toggleTooltip = (placeId: string | null) => {
    setActiveTooltip(activeTooltip === placeId ? null : placeId);
  };

  // Functions to open/close locations modal
  const openLocationsModal = (business: Business) => {
    setSelectedLocationsBusiness(business);
    setIsLocationsModalOpen(true);
  };

  const closeLocationsModal = () => {
    setIsLocationsModalOpen(false);
    setSelectedLocationsBusiness(null);
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

  // Check if businesses are in the database and fetch their enriched data
  const checkDatabaseForBusinesses = async () => {
    if (businesses.length === 0) return;
    
    setIsCheckingDatabase(true);
    try {
      const placeIds = businesses.map(b => b.placeId).filter(Boolean);
      if (placeIds.length === 0) return;

      console.log('[BusinessTable] Checking database for businesses:', placeIds);
      
      const response = await fetch('/api/dashboard');
      if (!response.ok) {
        throw new Error('Failed to fetch database businesses');
      }
      
      const data = await response.json();
      const dbBusinesses = data.businesses || [];
      
      // Create a map of placeId to database business
      const dbMap: {[key: string]: any} = {};
      dbBusinesses.forEach((dbBusiness: any) => {
        if (dbBusiness.placeId) {
          dbMap[dbBusiness.placeId] = dbBusiness;
        }
      });
      
      console.log('[BusinessTable] Found database businesses:', Object.keys(dbMap));
      setDatabaseBusinesses(dbMap);
      
      // Update contact info with database data for matching businesses
      const updatedContactInfo = { ...contactInfo };
      businesses.forEach(business => {
        const dbBusiness = dbMap[business.placeId];
        if (dbBusiness) {
          console.log(`[BusinessTable] Found database data for ${business.name}:`, dbBusiness);
          updatedContactInfo[business.placeId] = {
            website: dbBusiness.website || null,
            phone: dbBusiness.phone || null,
            emails: dbBusiness.emails || [],
            numLocations: dbBusiness.numLocations || null,
            locationNames: dbBusiness.locationNames || [],
            loading: false,
            usedPuppeteer: false,
            websiteStatus: 'ok'
          };
        }
      });
      
      setContactInfo(updatedContactInfo);
      
    } catch (error) {
      console.error('[BusinessTable] Error checking database:', error);
    } finally {
      setIsCheckingDatabase(false);
    }
  };

  // Refresh database state after enrichment
  const refreshDatabaseState = async () => {
    try {
      console.log('[BusinessTable] Refreshing database state after enrichment');
      await checkDatabaseForBusinesses();
    } catch (error) {
      console.error('[BusinessTable] Error refreshing database state:', error);
    }
  };

  // Perform the actual enrichment
  const performEnrichment = async (business: Business) => {
    try {
      // Use the new dedicated business enrichment endpoint
      const url = `/api/business/enrich/${business.placeId}`;
      console.log(`[Business Enrich] Enriching data for ${business.placeId} from:`, url);
      
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const data = await res.json();
      console.log(`[Business Enrich] Received enriched data for ${business.placeId}:`, data);
      
      if (!data.success) {
        throw new Error(data.message || 'Enrichment failed');
      }
      
      // Update contact info with enriched data
      setContactInfo(prev => ({
        ...prev,
        [business.placeId]: {
          website: data.business.website || null,
          phone: null, // Phone is not returned by the new endpoint
          emails: data.business.emails || [],
          numLocations: data.business.numLocations,
          locationNames: data.business.locationNames || [],
          loading: false,
          usedPuppeteer: false, // Not returned by the new endpoint
          websiteStatus: 'ok'
        }
      }));
      
      // Also update the business data
      updateBusinessData(business.id, {
        website: data.business.website,
        emails: data.business.emails || [],
        numLocations: data.business.numLocations,
        locationNames: data.business.locationNames || [],
        enrichedAt: data.business.enrichedAt
      });

      // Refresh database state to show updated enriched data and ICP scores
      await refreshDatabaseState();
      
      // Show success message
      setAlertModal({
        isOpen: true,
        title: 'Success',
        message: `${business.name} has been enriched successfully${data.business.icpScores ? ' and ICP scores have been recalculated' : ''}.`,
        type: 'success'
      });
    } catch (error) {
      console.error('Failed to enrich business data:', error);
      setContactInfo(prev => ({ ...prev, [business.placeId]: { ...(prev[business.placeId] || {}), loading: false } }));
      throw error; // Re-throw to be caught by caller
    }
  };

  // Add a function to enrich places data
  const enrichPlacesData = async (business: Business) => {
    const dbBusiness = databaseBusinesses[business.placeId];
    
    // Check if business was already enriched
    if (dbBusiness?.enrichedAt) {
      // Show confirmation modal
      setAlertModal({
        isOpen: true,
        title: 'Confirm Re-enrichment',
        message: 'This business was already enriched. Do you want to re-enrich it? This will re-scrape the website and may update location counts, emails, and other data.',
        type: 'confirm',
        onConfirm: async () => {
          updateLoadingState(business.id, 'enrich');
          try {
            await performEnrichment(business);
          } catch (error) {
            setAlertModal({
              isOpen: true,
              title: 'Error',
              message: 'Failed to enrich business data. Please try again.',
              type: 'error'
            });
          } finally {
            updateLoadingState(business.id, '');
          }
        }
      });
    } else {
      // No existing enrichment, enrich directly
      updateLoadingState(business.id, 'enrich');
      try {
        await performEnrichment(business);
      } catch (error) {
        setAlertModal({
          isOpen: true,
          title: 'Error',
          message: 'Failed to enrich business data. Please try again.',
          type: 'error'
        });
      } finally {
        updateLoadingState(business.id, '');
      }
    }
  };

  // Update the enrichWithApollo function to handle no results
  const enrichWithApollo = async (business: Business) => {
    updateLoadingState(business.id, 'apollo');
    try {
      // Use the new dedicated Apollo enrichment endpoint
      const url = `/api/apollo/enrich/${business.placeId}`;
      
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Apollo enrichment failed');
      }
      
      // Update business data with Apollo enrichment results without affecting contact info display
      if (business) {
        const decisionMakers = data.decisionMakers || [];
        updateBusinessData(business.id, { 
          decisionMakers,
          apolloStatus: decisionMakers.length > 0 ? 'found' : 'not_found'
        });
      }

      // Refresh database state to show updated enriched data
      await refreshDatabaseState();
    } catch (error) {
      console.error('Failed to enrich with Apollo:', error);
      updateBusinessData(business.id, { 
        apolloStatus: 'error'
      });
    } finally {
      updateLoadingState(business.id, '');
    }
  };

  // Perform the actual ICP calculation
  const performICPCalculation = async (businessId: string, showAlert: boolean = true) => {
    console.log('[BusinessTable] Starting ICP calculation for business:', businessId);
    try {
      // Calculate for both ICP types
      console.log('[BusinessTable] Making fetch requests to /api/icp-score...');
      const [midmarketRes, independentRes] = await Promise.all([
        fetch(`/api/icp-score/${businessId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ icpType: 'midmarket' })
        }),
        fetch(`/api/icp-score/${businessId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ icpType: 'independent' })
        })
      ]);
      console.log('[BusinessTable] Fetch responses received:', { midmarketOk: midmarketRes.ok, independentOk: independentRes.ok });

      if (midmarketRes.ok && independentRes.ok) {
        // Parse the responses to get the scores
        const midmarketData = await midmarketRes.json();
        const independentData = await independentRes.json();
        
        // Refresh database state to show updated scores
        await refreshDatabaseState();

        // Return scores for programmatic use
        const result = {
          midmarket: midmarketData,
          independent: independentData
        };

        // Only show alert if requested
        if (showAlert) {
          // Format scores with color indicators
          const mmScore = midmarketData.score?.toFixed(1) || 'N/A';
          const indScore = independentData.score?.toFixed(1) || 'N/A';
          
          const getScoreColor = (score: number) => {
            if (score >= 7) return '🟢';
            if (score >= 5) return '🟡';
            return '🔴';
          };
          
          const mmEmoji = typeof midmarketData.score === 'number' ? getScoreColor(midmarketData.score) : '';
          const indEmoji = typeof independentData.score === 'number' ? getScoreColor(independentData.score) : '';
          
          setAlertModal({
            isOpen: true,
            title: 'ICP Scores Calculated Successfully! 🎉',
            message: `MidMarket: ${mmEmoji} ${mmScore}/10\nIndependent: ${indEmoji} ${indScore}/10`,
            type: 'success'
          });
        }

        return result;
      } else {
        if (showAlert) {
          setAlertModal({
            isOpen: true,
            title: 'Error',
            message: 'Failed to calculate ICP scores. Please try again.',
            type: 'error'
          });
        }
        return null;
      }
    } catch (error) {
      console.error('Failed to calculate ICP:', error);
      if (showAlert) {
        setAlertModal({
          isOpen: true,
          title: 'Error',
          message: 'Failed to calculate ICP scores. Please try again.',
          type: 'error'
        });
      }
      return null;
    }
  };

  // Calculate ICP Score for a business
  const handleCalculateICP = async (business: Business) => {
    const dbBusiness = databaseBusinesses[business.placeId];
    if (!dbBusiness || !dbBusiness.id) {
      setAlertModal({
        isOpen: true,
        title: 'Error',
        message: 'Business not found in database. Please enrich the business first.',
        type: 'error'
      });
      return;
    }

    // Check if business has been enriched
    if (!dbBusiness.enrichedAt) {
      setAlertModal({
        isOpen: true,
        title: 'Enrichment Required',
        message: 'This business needs to be enriched first to get accurate ICP scores. Enrichment will analyze the website for locations, SEO practices, WhatsApp, reservations, and ordering systems.',
        type: 'confirm',
        confirmText: 'Enrich Now',
        cancelText: 'Cancel',
        onConfirm: async () => {
          console.log('[BusinessTable] Starting enrichment flow for ICP calculation');
          // Close alert modal and open progress modal
          setAlertModal({ ...alertModal, isOpen: false });
          setProgressModal({
            isOpen: true,
            stage: 'enriching',
            businessName: business.name
          });
          
          try {
            // Start enrichment (performEnrichment already shows success alert, we'll suppress it)
            const url = `/api/business/enrich/${business.placeId}`;
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });
            
            const data = await res.json();
            
            if (!data.success) {
              throw new Error(data.message || 'Enrichment failed');
            }
            
            // Refresh database state to get updated business
            await refreshDatabaseState();
            
            // Update to calculating stage
            setProgressModal(prev => ({
              ...prev,
              stage: 'calculating'
            }));

            // Get the updated database business
            const updatedDbBusiness = databaseBusinesses[business.placeId];
            
            if (updatedDbBusiness && updatedDbBusiness.id) {
              // Now calculate ICP with the enriched data (showAlert = false)
              const result = await performICPCalculation(updatedDbBusiness.id, false);
              
              if (result) {
                // Show completion with scores
                setProgressModal({
                  isOpen: true,
                  stage: 'complete',
                  businessName: business.name,
                  midmarketScore: result.midmarket?.score,
                  independentScore: result.independent?.score
                });
              } else {
                // Failed to calculate
                setProgressModal({ isOpen: false, stage: 'enriching', businessName: '' });
                setAlertModal({
                  isOpen: true,
                  title: 'Error',
                  message: 'Enrichment succeeded but ICP calculation failed. Please try calculating ICP again.',
                  type: 'error'
                });
              }
            } else {
              throw new Error('Failed to get updated business data');
            }
          } catch (error) {
            console.error('[BusinessTable] Enrichment flow error:', error);
            // Enrichment failed
            setProgressModal({ isOpen: false, stage: 'enriching', businessName: '' });
            setAlertModal({
              isOpen: true,
              title: 'Error',
              message: 'Failed to enrich business. Please try again.',
              type: 'error'
            });
          }
        }
      });
      return;
    }

    // Check if ICP scores already exist
    const hasExistingScores = dbBusiness.icpScores && 
      (dbBusiness.icpScores.midmarket?.score !== null || 
       dbBusiness.icpScores.independent?.score !== null);

    if (hasExistingScores) {
      // Show confirmation modal
      setAlertModal({
        isOpen: true,
        title: 'Confirm Recalculation',
        message: 'ICP scores already exist for this business. Do you want to recalculate them? This will overwrite the existing scores.',
        type: 'confirm',
        onConfirm: async () => {
          console.log('[BusinessTable] onConfirm called for ICP recalculation, dbBusiness.id:', dbBusiness.id);
          updateLoadingState(business.id, 'icp');
          await performICPCalculation(dbBusiness.id);
          updateLoadingState(business.id, '');
        }
      });
    } else {
      // No existing scores, calculate directly
      updateLoadingState(business.id, 'icp');
      await performICPCalculation(dbBusiness.id);
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

  // Get the total number of website emails in selected businesses
  const getSelectedWebsiteEmailsCount = (): number => {
    if (selectedBusinesses.size === 0) return 0;
    
    const websiteEmails = new Set<string>();

    selectedBusinesses.forEach(businessId => {
      const business = businesses.find(b => b.id === businessId);
      if (business) {
        const enrichedBusiness = getBusinessData(business);
        
        enrichedBusiness.locations?.forEach(location => {
          location.emails?.forEach(email => {
            if (email) websiteEmails.add(email);
          });
        });
      }
    });
    
    return websiteEmails.size;
  };

  // Get the total number of Apollo emails in selected businesses
  const getSelectedApolloEmailsCount = (): number => {
    if (selectedBusinesses.size === 0) return 0;
    
    const apolloEmails = new Set<string>();

    selectedBusinesses.forEach(businessId => {
      const business = businesses.find(b => b.id === businessId);
      if (business) {
        const enrichedBusiness = getBusinessData(business);

        enrichedBusiness.decisionMakers?.forEach(dm => {
          if (dm.email && !dm.email.includes('email_not_unlocked') && !dm.email.includes('not_available')) {
            apolloEmails.add(dm.email);
          }
        });
      }
    });
    
    return apolloEmails.size;
  };
  
  const websiteEmailsCount = getSelectedWebsiteEmailsCount();
  const apolloEmailsCount = getSelectedApolloEmailsCount();

  // Add a grader function to score the business
  const gradeBusinessQuality = async (business: Business) => {
    updateLoadingState(business.id, 'grader');
    
    try {
      // Call the server endpoint to grade the business
      const response = await fetch('http://localhost:3001/api/grade-business', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ placeId: business.placeId })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to grade business: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // The API returns score as a decimal between 0 and 1
      const scoreAsPercentage = Math.round(data.score || 0);
      
      // Update the business with the grader score from the API
      updateBusinessData(business.id, { 
        graderScore: scoreAsPercentage,
        reportId: data.reportId  // Store the report ID for viewing later
      });
      
      return data;
    } catch (error) {
      console.error('Failed to grade business:', error);
    } finally {
      updateLoadingState(business.id, '');
    }
  };

  // Function to open/view the grader report
  const viewGraderReport = async (reportId: string, businessName: string) => {
    if (!reportId) return;
    
    try {
      // Open the report in a new tab
      window.open(`http://localhost:3001/api/grade-report/${reportId}`, '_blank');
    } catch (error) {
      console.error('Failed to view report:', error);
    }
  };

  // Batch grader function for multiple businesses
  const batchGradeBusinesses = async () => {
    if (selectedBusinesses.size === 0) return;
    
    try {
      const selectedBusinessList = businesses.filter(b => selectedBusinesses.has(b.id));
      
      // Grade each selected business
      for (const business of selectedBusinessList) {
        updateLoadingState(business.id, 'grader');
        await gradeBusinessQuality(business);
        // Small delay to show progression
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
    } catch (error) {
      console.error('Failed to batch grade businesses:', error);
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
            <div className="flex items-center space-x-3">
              <h3 className="text-lg font-semibold text-gray-900">
                Found {businesses.length} businesses
              </h3>
              {isCheckingDatabase && (
                <div className="flex items-center text-sm text-gray-600">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Checking database...
                </div>
              )}
            </div>
            <div className="flex items-center space-x-4">
              {selectedBusinesses.size > 0 && (
                <div className="flex items-center space-x-3">
                  <span className="text-sm text-gray-600">
                    {selectedBusinesses.size} selected
                  </span>
                  <span className="text-sm px-2 py-1 bg-blue-50 text-blue-700 rounded-md">
                    {websiteEmailsCount} Website ✉️
                  </span>
                  <span className="text-sm px-2 py-1 bg-purple-50 text-purple-700 rounded-md">
                    {apolloEmailsCount} Apollo ✉️
                  </span>
                </div>
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
                  
                  {/* Grade Businesses Button */}
                  <button
                    onClick={batchGradeBusinesses}
                    disabled={isEnrichingPlaces || isEnrichingApollo || isExecuting}
                    className="flex items-center px-3 py-1.5 bg-amber-100 text-amber-700 rounded-md hover:bg-amber-200 disabled:opacity-50 transition-all duration-200"
                    title="Grade selected businesses"
                  >
                    <Star className="h-4 w-4 mr-1" />
                    Grade Businesses
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
                <th style={{ width: 80 }} className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer whitespace-nowrap" onClick={() => handleSort('graderScore')}>
                  Grader
                  <span className="ml-1">{sortBy === 'graderScore' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}</span>
                </th>
                <th style={{ width: 100 }} className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">ICP Score</th>
                <th style={{ width: 140 }} className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-10">Actions</th>
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
                          {hasEnrichedPlacesData(business) && (
                            <span 
                              className="ml-1 flex items-center justify-center w-5 h-5 bg-green-100 rounded-full text-green-600"
                              title="Enriched data available from database"
                            >
                              <CheckCircle className="h-3 w-3" />
                            </span>
                          )}
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
                              <div className="flex items-center">
                                <a
                                  href={getBestWebsiteUrl(business) || undefined}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center text-xs text-blue-600 hover:text-blue-800"
                                >
                                  <Globe className="h-4 w-4 mr-1 inline" />{getDomain(getBestWebsiteUrl(business))}
                                </a>
                                {contactInfo[business.placeId]?.websiteStatus === 'timeout' && (
                                  <span className="ml-1" title="Website timed out">🕰️</span>
                                )}
                                {contactInfo[business.placeId]?.websiteStatus === 'not_found' && (
                                  <span className="ml-1" title="Website not found (404)">⚠️</span>
                                )}
                                {contactInfo[business.placeId]?.websiteStatus === 'enotfound' && (
                                  <span className="ml-1" title="Website not found (DNS lookup failed)">🚫</span>
                                )}
                                {contactInfo[business.placeId]?.usedPuppeteer && (
                                  <div 
                                    className="ml-1 relative group inline-block"
                                  >
                                    <span className="text-amber-500 cursor-pointer">⚠️</span>
                                    <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 w-72 max-w-[300px]">
                                      This website was accessed using advanced techniques to bypass bot protection
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="flex items-center text-xs text-gray-400"><Globe className="h-4 w-4 mr-1 inline" />No website found</span>
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
                            <button
                              onClick={() => openLocationsModal(business)}
                              className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs hover:bg-blue-200 cursor-pointer transition-colors"
                            >
                              {contactInfo[business.placeId]?.numLocations} locations
                            </button>
                          ) : (
                            contactInfo[business.placeId]?.numLocations
                          )}
                        </div>
                      ) : '-'}
                    </td>
                    <td style={{ width: 120 }} className="px-2 py-1 text-xs">
                      {Array.isArray(enrichedBusiness.locations?.[0]?.emails) && enrichedBusiness.locations[0].emails.length > 0 ? (
                        <div className="space-y-0.5">
                          {enrichedBusiness.locations[0].emails.map((email, idx) => (
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
                      {(() => {
                        // First check for Apollo contacts from database
                        const dbBusiness = databaseBusinesses[business.placeId];
                        const dbApolloContacts = dbBusiness?.decisionMakers || [];
                        

                        // Then check for current session decision makers
                        const sessionDecisionMakers = enrichedBusiness.decisionMakers || [];
                        
                        // Use database contacts if available, otherwise use session data
                        const apolloContacts = dbApolloContacts.length > 0 ? dbApolloContacts : sessionDecisionMakers;
                        
                        const attempted = hasApolloBeenAttempted(business);
                        const hasData = hasEnrichedApolloData(business);
                        
                        if (Array.isArray(apolloContacts) && apolloContacts.length > 0) {
                          return (
                            <div className="space-y-1">
                              {apolloContacts.map((dm, idx) => (
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
                                          LI
                                        </a>
                                      </>
                                    )}
                                    {dm.email && (
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
                          );
                        } else if (attempted && !hasData) {
                          return <span className="text-xs text-gray-500 italic">No DMs found in Apollo</span>;
                        } else {
                          return <span className="text-xs text-gray-400">-</span>;
                        }
                      })()}
                    </td>
                    <td style={{ width: 80 }} className="px-2 py-1 text-xs text-center">
                      {enrichedBusiness.graderScore !== undefined && enrichedBusiness.graderScore !== null ? (
                        <div className="flex flex-row items-center justify-center gap-2">
                          <span className={`text-sm font-medium ${
                            enrichedBusiness.graderScore >= 70 ? 'text-green-600' : 
                            enrichedBusiness.graderScore >= 40 ? 'text-amber-600' : 
                            'text-red-600'
                          }`}>
                            {enrichedBusiness.graderScore}%
                          </span>
                          {enrichedBusiness.reportId && (
                            <button
                              onClick={() => viewGraderReport(enrichedBusiness.reportId!, enrichedBusiness.name)}
                              className="text-xs text-blue-600 hover:underline flex items-center"
                              title="View Report"
                            >
                              <FileText className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td style={{ width: 100 }} className="px-2 py-1 text-xs text-center">
                      {(() => {
                        const dbBusiness = databaseBusinesses[business.placeId];
                        const icpScores = dbBusiness?.icpScores;
                        
                        return (
                          <div className="flex flex-col gap-1">
                            {/* MidMarket Score */}
                            {icpScores?.midmarket?.score !== undefined && icpScores?.midmarket?.score !== null ? (
                              <button
                                onClick={() => setIcpBreakdownModal({
                                  isOpen: true,
                                  type: 'midmarket',
                                  breakdown: icpScores.midmarket.breakdown,
                                  score: icpScores.midmarket.score,
                                  businessName: business.name,
                                  category: dbBusiness?.category || business.category || null,
                                  website: dbBusiness?.website || null
                                })}
                                className={`px-2 py-0.5 rounded text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${
                                  icpScores.midmarket.score >= 7 ? 'bg-green-100 text-green-800' :
                                  icpScores.midmarket.score >= 5 ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }`}
                              >
                                MM: {icpScores.midmarket.score.toFixed(1)}
                              </button>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
                                MM: N/A
                              </span>
                            )}
                            
                            {/* Independent Score */}
                            {icpScores?.independent?.score !== undefined && icpScores?.independent?.score !== null ? (
                              <button
                                onClick={() => setIcpBreakdownModal({
                                  isOpen: true,
                                  type: 'independent',
                                  breakdown: icpScores.independent.breakdown,
                                  score: icpScores.independent.score,
                                  businessName: business.name,
                                  category: dbBusiness?.category || business.category || null,
                                  website: dbBusiness?.website || null
                                })}
                                className={`px-2 py-0.5 rounded text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${
                                  icpScores.independent.score >= 7 ? 'bg-green-100 text-green-800' :
                                  icpScores.independent.score >= 5 ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }`}
                              >
                                Ind: {icpScores.independent.score.toFixed(1)}
                              </button>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
                                Ind: N/A
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td style={{ width: 140 }} className="px-2 py-1 text-xs">
                      <div className="flex items-center justify-center space-x-1">
                        {/* Google Places Enrich Button */}
                        <button
                          onClick={() => enrichPlacesData(business)}
                          disabled={loading === 'enrich'}
                          className={`flex items-center justify-center w-6 h-6 rounded-full transition-colors ${
                            hasEnrichedPlacesData(business) 
                              ? 'bg-green-100 text-green-600 hover:bg-green-200 hover:text-green-800' 
                              : 'bg-blue-100 hover:bg-blue-200 text-blue-600 hover:text-blue-800'
                          } ${loading === 'enrich' ? 'opacity-50' : ''}`}
                          title={hasEnrichedPlacesData(business) ? "Already enriched from database" : "Enrich Google Places"}
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
                          disabled={loading === 'apollo' || hasEnrichedApolloData(business)}
                          className={`flex items-center justify-center w-6 h-6 rounded-full transition-colors ${
                            hasEnrichedApolloData(business) 
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                              : 'bg-purple-100 hover:bg-purple-200 text-purple-600 hover:text-purple-800'
                          } ${loading === 'apollo' ? 'opacity-50' : ''}`}
                          title={hasEnrichedApolloData(business) ? 
                            "Already enriched with Apollo" : 
                            "Enrich with Apollo"}
                        >
                          {loading === 'apollo' ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Shield className="h-3 w-3" />
                          )}
                        </button>
                        
                        {/* Grader Button */}
                        <button
                          onClick={() => gradeBusinessQuality(business)}
                          disabled={loading === 'grader'}
                          className="flex items-center justify-center w-6 h-6 bg-amber-100 hover:bg-amber-200 rounded-full text-amber-600 hover:text-amber-800 transition-colors disabled:opacity-50"
                          title="Grade business quality"
                        >
                          {loading === 'grader' ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Star className="h-3 w-3" />
                          )}
                        </button>
                        <button
                          onClick={() => openEmailModal(enrichedBusiness)}
                          className="flex items-center justify-center w-6 h-6 bg-green-100 hover:bg-green-200 rounded-full text-green-600 hover:text-green-800 transition-colors disabled:opacity-50"
                          title="Send Email"
                          disabled={!hasEnrichedApolloData(business)}
                        >
                          <Mail className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleCalculateICP(business)}
                          className="flex items-center justify-center w-6 h-6 bg-purple-100 hover:bg-purple-200 rounded-full text-purple-600 hover:text-purple-800 transition-colors disabled:opacity-50"
                          title="Calculate ICP Score"
                          disabled={loading === 'icp'}
                        >
                          {loading === 'icp' ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Calculator className="h-3 w-3" />
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
      <EmailModal 
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        business={selectedBusinessForEmail}
        emailTemplates={emailTemplates}
        databaseBusinesses={databaseBusinesses}
        onSendEmail={handleSendEmail}
      />
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
        onConfirm={alertModal.onConfirm}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />

      {/* Progress Modal */}
      {progressModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            {progressModal.stage === 'enriching' && (
              <>
                <div className="flex items-center justify-center mb-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
                  Enriching Business Data
                </h3>
                <p className="text-sm text-gray-600 text-center">
                  Analyzing {progressModal.businessName}'s website for locations, SEO practices, WhatsApp, reservations, and ordering systems...
                </p>
              </>
            )}

            {progressModal.stage === 'calculating' && (
              <>
                <div className="flex items-center justify-center mb-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
                  Calculating ICP Scores
                </h3>
                <p className="text-sm text-gray-600 text-center">
                  Enrichment complete! Now calculating ICP scores for {progressModal.businessName}...
                </p>
              </>
            )}

            {progressModal.stage === 'complete' && (
              <>
                <div className="flex items-center justify-center mb-4">
                  <div className="text-5xl">🎉</div>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 text-center mb-4">
                  ICP Scores Calculated Successfully!
                </h3>
                <div className="space-y-3 mb-6">
                  {progressModal.midmarketScore !== undefined && progressModal.midmarketScore !== null && (
                    <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                      <span className="font-medium text-gray-700">MidMarket:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">
                          {progressModal.midmarketScore >= 7 ? '🟢' : 
                           progressModal.midmarketScore >= 5 ? '🟡' : '🔴'}
                        </span>
                        <span className="text-lg font-bold text-gray-900">
                          {progressModal.midmarketScore.toFixed(1)}/10
                        </span>
                      </div>
                    </div>
                  )}
                  {progressModal.independentScore !== undefined && progressModal.independentScore !== null && (
                    <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                      <span className="font-medium text-gray-700">Independent:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">
                          {progressModal.independentScore >= 7 ? '🟢' : 
                           progressModal.independentScore >= 5 ? '🟡' : '🔴'}
                        </span>
                        <span className="text-lg font-bold text-gray-900">
                          {progressModal.independentScore.toFixed(1)}/10
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setProgressModal({ ...progressModal, isOpen: false })}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}
      
      {/* ICP Breakdown Modal */}
      {icpBreakdownModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-[883px] w-full mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                {icpBreakdownModal.type === 'midmarket' ? 'MidMarket' : 'Independent'} ICP Breakdown
              </h2>
              <button
                onClick={() => setIcpBreakdownModal({ ...icpBreakdownModal, isOpen: false })}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="mb-6 pb-4 border-b border-gray-200">
                {/* First Row: Business, Category, Total Score */}
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Business</div>
                    <div className="text-lg font-semibold text-gray-900">{icpBreakdownModal.businessName}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Category</div>
                    <div className="text-lg font-semibold text-gray-900">{icpBreakdownModal.category || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Total Score</div>
                    <div className={`inline-block px-3 py-1 rounded text-lg font-bold ${
                      (icpBreakdownModal.score || 0) >= 7 ? 'bg-green-100 text-green-800' :
                      (icpBreakdownModal.score || 0) >= 5 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {icpBreakdownModal.score?.toFixed(1)}/10
                    </div>
                  </div>
                </div>
                
                {/* Second Row: Website (full width) */}
                <div>
                  <div className="text-sm text-gray-600 mb-1">Website</div>
                  {icpBreakdownModal.website ? (
                    <a 
                      href={icpBreakdownModal.website} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-lg font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {icpBreakdownModal.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').split('?')[0]}
                    </a>
                  ) : (
                    <div className="text-lg font-semibold text-gray-400">N/A</div>
                  )}
                </div>
              </div>
              
              <div>
                <div className="text-sm font-semibold text-gray-900 mb-3">Factor Breakdown</div>
                {icpBreakdownModal.breakdown && Object.keys(icpBreakdownModal.breakdown).length > 0 ? (
                  <div className="grid grid-cols-3 gap-3">
                    {Object.entries(icpBreakdownModal.breakdown).map(([key, value]: [string, any]) => {
                      // Convert technical names to human-readable labels
                      const factorLabels: { [key: string]: string } = {
                        numLocations: 'Number of Locations',
                        noWebsite: 'No Website',
                        poorSEO: 'Poor SEO Practices',
                        hasWhatsApp: 'WhatsApp Contact',
                        hasReservation: 'Reservation System',
                        hasDirectOrdering: 'Direct Ordering',
                        geography: 'Target Geography',
                        deliveryIntensiveCategory: 'Delivery Intensive',
                        bookingIntensiveCategory: 'Booking Intensive'
                      };
                      
                      // Format value display based on factor type
                      const formatValue = (val: any, key: string) => {
                        if (val === null || val === undefined) return 'N/A';
                        
                        // Special handling for poorSEO: invert the boolean display
                        if (key === 'poorSEO' && typeof val === 'boolean') {
                          return val ? 'No' : 'Yes'; // hasSEO=true means "No poor SEO", hasSEO=false means "Yes poor SEO"
                        }
                        
                        if (typeof val === 'boolean') return val ? 'Yes' : 'No';
                        if (typeof val === 'object' && val.hasDirectOrdering !== undefined) {
                          return val.hasDirectOrdering && val.hasThirdPartyDelivery ? 'Has both' : 
                                 val.hasDirectOrdering ? 'Direct only' : 'None';
                        }
                        return val.toString();
                      };
                      
                      // Get ideal range for numLocations
                      const getIdealRange = (key: string, data: any) => {
                        if (key === 'numLocations' && data.minIdeal !== undefined) {
                          // If no maxIdeal or it's null, show "more than X"
                          if (data.maxIdeal === null || data.maxIdeal === undefined) {
                            return `Ideal: more than ${data.minIdeal} location${data.minIdeal === 1 ? '' : 's'}`;
                          }
                          // If minIdeal equals maxIdeal, show exact number
                          if (data.minIdeal === data.maxIdeal) {
                            return `Ideal: ${data.minIdeal} location${data.minIdeal === 1 ? '' : 's'}`;
                          }
                          // Otherwise show range
                          return `Ideal: ${data.minIdeal}-${data.maxIdeal} locations`;
                        }
                        return null;
                      };
                      
                      // Get tooltip explanation for category scoring
                      const getTooltip = (key: string, val: any) => {
                        if (key === 'deliveryIntensiveCategory') {
                          if (val === 'delivery-intensive') {
                            return 'This business category is highly suited for delivery (Pizza, Hamburguesas, Sushi, Comida Mexicana, Comida Healthy, Milanesas, Empanadas). These categories have strong delivery demand and work well for direct ordering platforms. Score: 100%';
                          } else if (val === 'moderate') {
                            return 'This business category has moderate delivery potential. While not a primary delivery category, it can still benefit from delivery services. The category doesn\'t fall into high-delivery or no-delivery lists. Score: 33%';
                          } else {
                            return 'This business category is not typically delivery-focused. It may be better suited for dine-in or other business models. Score: 0%';
                          }
                        }
                        if (key === 'bookingIntensiveCategory') {
                          if (val === 'booking-intensive') {
                            return 'This business category typically requires reservations (Bar, Craft Beer, Fine Dining). These establishments benefit greatly from online booking systems to manage table availability and customer flow. Score: 100%';
                          } else if (val === 'no-booking') {
                            return 'This business category doesn\'t typically accept reservations (Coffee shops, Cafeterías, Ice Cream shops). These are walk-in establishments where bookings aren\'t necessary or practical. Score: 0%';
                          } else {
                            return 'This business category has moderate booking needs. While not a primary reservation-based business, it could benefit from a booking system during peak times. Score: 50%';
                          }
                        }
                        return null;
                      };
                      
                      return (
                        <div key={key} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                          <div className="flex items-center gap-1 mb-1">
                            <div className="text-sm font-medium text-gray-700">{factorLabels[key] || key}</div>
                            {getTooltip(key, value.value) && (
                              <div className="relative group">
                                <Info className="w-4 h-4 text-gray-400 cursor-help" />
                                <div className="absolute left-0 bottom-full mb-2 w-80 p-3 bg-gray-900 text-white text-xs rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 leading-relaxed">
                                  {getTooltip(key, value.value)}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mb-1">
                            Value: <span className="font-semibold text-gray-700">{formatValue(value.value, key)}</span>
                          </div>
                          {getIdealRange(key, value) && (
                            <div className="text-xs text-blue-600 mb-1">
                              {getIdealRange(key, value)}
                            </div>
                          )}
                          <div className="text-xs text-gray-500 mb-2">
                            Score: {value.scorePercent?.toFixed(0)}% × Weight: {value.weight}
                          </div>
                          <div className="text-lg font-bold text-gray-900">
                            {value.contribution?.toFixed(2)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <p className="mb-2">No breakdown data available.</p>
                    <p className="text-sm">Please calculate the ICP score for this business.</p>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex justify-end p-6 border-t border-gray-200">
              <button
                onClick={() => setIcpBreakdownModal({ ...icpBreakdownModal, isOpen: false })}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Locations Modal */}
      {isLocationsModalOpen && selectedLocationsBusiness && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                Brand Locations - {selectedLocationsBusiness.name}
              </h2>
              <button
                onClick={closeLocationsModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6">
              {contactInfo[selectedLocationsBusiness.placeId]?.locationNames && contactInfo[selectedLocationsBusiness.placeId].locationNames!.length > 0 ? (
                <div className="space-y-4">
                  <div className="mb-4">
                    <p className="text-sm text-gray-600">
                      This business has <span className="font-medium">{contactInfo[selectedLocationsBusiness.placeId]?.numLocations}</span> location(s):
                    </p>
                  </div>
                  {contactInfo[selectedLocationsBusiness.placeId].locationNames!.map((location: string, index: number) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center">
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs mr-3">
                          {index + 1}
                        </span>
                        <span className="text-sm font-medium text-gray-900">{location}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">No location details available for this business.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default BusinessTable;