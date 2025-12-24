import React, { useState, useEffect } from 'react';
import { Search, Filter, Download, SortAsc, SortDesc, RefreshCw, X, ExternalLink, Mail, Calculator, Info, Map, Loader2, Trash2, Star, FileText } from 'lucide-react';
import AlertModal from './AlertModal';

interface Place {
  id: string;
  name: string;
  address: string;
  website: string;
  placeId: string;
  phone: string;
  emails: string[];
  types: string[];
  rating: number | null;
  userRatingsTotal: number | null;
  numLocations: number | null;
  locationNames: string[];
  enriched: boolean;
  addedAt: string;
  country?: string | null;
  decisionMakers?: any[];
  apolloAttempted?: boolean;
  icpScores?: {
    midmarket?: {
      score: number;
      breakdown: any;
      lastCalculated: string;
    };
    independent?: {
      score: number;
      breakdown: any;
      lastCalculated: string;
    };
  };
  graderScore?: number;
  reportId?: string;
}

const PlacesPage: React.FC = () => {
  const [places, setPlaces] = useState<Place[]>([]);
  const [filteredPlaces, setFilteredPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [ratingFilter, setRatingFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [enrichedFilter, setEnrichedFilter] = useState('');
  const [icpScoreFilter, setIcpScoreFilter] = useState('');
  
  // Sort states
  const [sortField, setSortField] = useState<keyof Place | 'icpScore'>('addedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [isLocationsModalOpen, setIsLocationsModalOpen] = useState(false);
  const [selectedLocationPlace, setSelectedLocationPlace] = useState<Place | null>(null);
  const [isTypesModalOpen, setIsTypesModalOpen] = useState(false);
  const [selectedTypesPlace, setSelectedTypesPlace] = useState<Place | null>(null);
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
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'confirm' | 'info';
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'success'
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

  const [cloneModal, setCloneModal] = useState<{
    isOpen: boolean;
    sourceName: string;
    sourcePlaceId: string;
    fuzzyMatches: Array<{
      placeId: string;
      name: string;
      address: string;
      similarity: number;
    }>;
    selectedMatches: string[];
  }>({
    isOpen: false,
    sourceName: '',
    sourcePlaceId: '',
    fuzzyMatches: [],
    selectedMatches: []
  });

  // Selection state for bulk delete
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [gradingPlaceId, setGradingPlaceId] = useState<string | null>(null);
  const [enrichingPlaceId, setEnrichingPlaceId] = useState<string | null>(null);
  const [enrichmentProgress, setEnrichmentProgress] = useState<{
    isOpen: boolean;
    businessName: string;
    messages: string[];
    currentStep: number;
    totalSteps: number;
  }>({
    isOpen: false,
    businessName: '',
    messages: [],
    currentStep: 0,
    totalSteps: 6
  });

  useEffect(() => {
    fetchPlaces();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [places, searchTerm, typeFilter, ratingFilter, locationFilter, enrichedFilter, icpScoreFilter, sortField, sortDirection]);

  useEffect(() => {
    setCurrentPage(1);
  }, [itemsPerPage]);

  // Handle ESC key to close modals
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isModalOpen) {
          setIsModalOpen(false);
          setSelectedPlace(null);
        }
        if (isLocationsModalOpen) {
          setIsLocationsModalOpen(false);
          setSelectedLocationPlace(null);
        }
        if (isTypesModalOpen) {
          setIsTypesModalOpen(false);
          setSelectedTypesPlace(null);
        }
        if (icpBreakdownModal.isOpen) {
          setIcpBreakdownModal({ ...icpBreakdownModal, isOpen: false });
        }
        if (alertModal.isOpen) {
          setAlertModal({ ...alertModal, isOpen: false });
        }
        if (progressModal.isOpen && progressModal.stage === 'complete') {
          setProgressModal({ ...progressModal, isOpen: false });
        }
        if (enrichmentProgress.isOpen) {
          setEnrichmentProgress({ isOpen: false, businessName: '', messages: [], currentStep: 0, totalSteps: 6 });
        }
      }
    };

    document.addEventListener('keydown', handleEscKey);
    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [isModalOpen, isLocationsModalOpen, isTypesModalOpen, icpBreakdownModal, alertModal, progressModal, enrichmentProgress]);

  const fetchPlaces = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/dashboard');
      if (!response.ok) {
        throw new Error('Failed to fetch places');
      }
      const data = await response.json();
      const businesses = data.businesses || [];
      console.log('[PlacesPage] Fetched places:', {
        count: businesses.length,
        sample: businesses.slice(0, 3).map((b: Place) => ({
          name: b.name,
          enriched: b.enriched,
          types: b.types,
          rating: b.rating,
          locationNames: b.locationNames
        }))
      });
      setPlaces(businesses);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch places');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async (): Promise<Place[] | null> => {
    try {
      setRefreshing(true);
      const response = await fetch('/api/dashboard');
      if (!response.ok) {
        throw new Error('Failed to fetch places');
      }
      const data = await response.json();
      const updatedPlaces = data.businesses || [];
      setPlaces(updatedPlaces);
      setError(null);
      return updatedPlaces;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch places');
      return null;
    } finally {
      setRefreshing(false);
    }
  };

  // Perform the actual ICP calculation
  const performICPCalculation = async (businessId: string, showAlert: boolean = true) => {
    console.log('[PlacesPage] Starting ICP calculation for business:', businessId);
    try {
      // Calculate for both ICP types
      console.log('[PlacesPage] Making fetch requests to /api/icp-score...');
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
      console.log('[PlacesPage] Fetch responses received:', { midmarketOk: midmarketRes.ok, independentOk: independentRes.ok });

      if (midmarketRes.ok && independentRes.ok) {
        // Parse the responses to get the scores
        const midmarketData = await midmarketRes.json();
        const independentData = await independentRes.json();
        
        // Refresh the places list to show updated scores
        await handleRefresh();

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
      console.error('Error calculating ICP:', error);
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

  // Enrich a business
  const handleEnrichBusiness = async (placeId: string, businessName?: string): Promise<boolean> => {
    try {
      setEnrichingPlaceId(placeId);
      
      // Open progress modal
      setEnrichmentProgress({
        isOpen: true,
        businessName: businessName || 'Business',
        messages: [],
        currentStep: 0,
        totalSteps: 6
      });

      // Use EventSource for SSE (must use GET, so we'll use query params)
      const eventSource = new EventSource(`/api/business/enrich-stream/${placeId}`);
      
      let enrichmentComplete = false;
      let fuzzyMatchesData: any[] = [];
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.message) {
          setEnrichmentProgress(prev => ({
            ...prev,
            messages: [...prev.messages, data.message]
          }));
        }
        if (data.step !== undefined) {
          setEnrichmentProgress(prev => ({
            ...prev,
            currentStep: data.step
          }));
        }
        if (data.fuzzyMatches) {
          fuzzyMatchesData = data.fuzzyMatches;
        }
        if (data.done) {
          enrichmentComplete = true;
          eventSource.close();
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE Error:', error);
        eventSource.close();
      };

      // Wait for the enrichment to complete
      await new Promise((resolve) => {
        const checkComplete = setInterval(() => {
          if (enrichmentComplete || !eventSource || eventSource.readyState === EventSource.CLOSED) {
            clearInterval(checkComplete);
            resolve(null);
          }
        }, 100);
      });

      // Refresh the places list to show updated data
      await handleRefresh();
      
      // Check if there are fuzzy matches that need user confirmation
      if (fuzzyMatchesData && fuzzyMatchesData.length > 0) {
        console.log('[Enrichment] Found fuzzy matches:', fuzzyMatchesData);
        setCloneModal({
          isOpen: true,
          sourceName: businessName || 'Business',
          sourcePlaceId: placeId,
          fuzzyMatches: fuzzyMatchesData,
          selectedMatches: [] // Start with none selected
        });
      }
      
      return true;
    } catch (error) {
      console.error('Error enriching business:', error);
      setAlertModal({
        isOpen: true,
        title: 'Error',
        message: 'Failed to enrich business. Please try again.',
        type: 'error'
      });
      return false;
    } finally {
      setEnrichingPlaceId(null);
    }
  };

  // Handle manual cloning for fuzzy matches
  const handleCloneEnrichment = async () => {
    if (cloneModal.selectedMatches.length === 0) {
      setAlertModal({
        isOpen: true,
        title: 'No Selection',
        message: 'Please select at least one business to clone enrichment to.',
        type: 'error'
      });
      return;
    }

    try {
      setRefreshing(true);
      const response = await fetch('/api/business/clone-enrichment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePlaceId: cloneModal.sourcePlaceId,
          targetPlaceIds: cloneModal.selectedMatches
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[Clone] Response:', data);
        
        // Close the clone modal
        setCloneModal({
          isOpen: false,
          sourceName: '',
          sourcePlaceId: '',
          fuzzyMatches: [],
          selectedMatches: []
        });
        
        // Refresh the places list
        await handleRefresh();
        
        // Show success message
        setAlertModal({
          isOpen: true,
          title: 'Success',
          message: `Successfully cloned enrichment to ${data.clonedBusinesses.length} business(es)!`,
          type: 'success'
        });
      } else {
        setAlertModal({
          isOpen: true,
          title: 'Error',
          message: 'Failed to clone enrichment. Please try again.',
          type: 'error'
        });
      }
    } catch (error) {
      console.error('Error cloning enrichment:', error);
      setAlertModal({
        isOpen: true,
        title: 'Error',
        message: 'Failed to clone enrichment. Please try again.',
        type: 'error'
      });
    } finally {
      setRefreshing(false);
    }
  };

  // Enrich places data with confirmation
  const enrichPlacesData = async (place: Place) => {
    // Check if business was already enriched
    if (place.enriched) {
      // Show confirmation modal
      setAlertModal({
        isOpen: true,
        title: 'Confirm Re-enrichment',
        message: 'This business was already enriched. Do you want to re-enrich it? This will re-scrape the website and may update location counts, emails, and other data.',
        type: 'confirm',
        onConfirm: async () => {
          await handleEnrichBusiness(place.placeId, place.name);
        }
      });
    } else {
      // No existing enrichment, enrich directly
      await handleEnrichBusiness(place.placeId, place.name);
    }
  };

  // Calculate ICP Score for a business
  const handleCalculateICP = async (place: Place) => {
    if (!place.id) {
      setAlertModal({
        isOpen: true,
        title: 'Error',
        message: 'Business not found in database. Please ensure the business is saved.',
        type: 'error'
      });
      return;
    }

    // Check if business has been enriched
    if (!place.enriched) {
      setAlertModal({
        isOpen: true,
        title: 'Enrichment Required',
        message: 'This business needs to be enriched first to get accurate ICP scores. Enrichment will analyze the website for locations, SEO practices, WhatsApp, reservations, and ordering systems.',
        type: 'confirm',
        confirmText: 'Enrich Now',
        cancelText: 'Cancel',
        onConfirm: async () => {
          // Close alert modal and open progress modal
          setAlertModal({ ...alertModal, isOpen: false });
          setProgressModal({
            isOpen: true,
            stage: 'enriching',
            businessName: place.name
          });

          const enriched = await handleEnrichBusiness(place.placeId, place.name);
          if (enriched) {
            // Update to calculating stage
            setProgressModal(prev => ({
              ...prev,
              stage: 'calculating'
            }));

            // After successful enrichment, automatically calculate ICP
            // Get the updated place data
            const updatedPlaces = await handleRefresh();
            const updatedPlace = updatedPlaces?.find((p: Place) => p.placeId === place.placeId);
            if (updatedPlace) {
              // Now calculate ICP with the enriched data (showAlert = false)
              const result = await performICPCalculation(updatedPlace.id, false);
              
              if (result) {
                // Show completion with scores
                setProgressModal({
                  isOpen: true,
                  stage: 'complete',
                  businessName: place.name,
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
            }
          } else {
            // Enrichment failed
            setProgressModal({ isOpen: false, stage: 'enriching', businessName: '' });
          }
        }
      });
      return;
    }

    // Check if ICP scores already exist
    const hasExistingScores = place.icpScores && 
      (place.icpScores.midmarket?.score !== null || 
       place.icpScores.independent?.score !== null);

    if (hasExistingScores) {
      // Show confirmation modal
      setAlertModal({
        isOpen: true,
        title: 'Confirm Recalculation',
        message: 'ICP scores already exist for this business. Do you want to recalculate them? This will overwrite the existing scores.',
        type: 'confirm',
        onConfirm: async () => {
          console.log('[PlacesPage] onConfirm called for ICP recalculation, place.id:', place.id);
          // Close the alert modal first
          setAlertModal({ ...alertModal, isOpen: false });
          setRefreshing(true);
          await performICPCalculation(place.id);
          setRefreshing(false);
        }
      });
    } else {
      // No existing scores, calculate directly
      setRefreshing(true);
      await performICPCalculation(place.id);
      setRefreshing(false);
    }
  };

  // Grader function to score the business
  const gradeBusinessQuality = async (place: Place) => {
    setGradingPlaceId(place.placeId);
    
    try {
      // Call the server endpoint to grade the business
      const response = await fetch('/api/grade-business', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ placeId: place.placeId })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to grade business: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // The API returns score as a decimal between 0 and 1
      const scoreAsPercentage = Math.round(data.score || 0);
      
      // Update the place in the list with the grader score
      setPlaces(prevPlaces => prevPlaces.map(p => 
        p.placeId === place.placeId 
          ? { ...p, graderScore: scoreAsPercentage, reportId: data.reportId }
          : p
      ));
      
      setAlertModal({
        isOpen: true,
        title: 'Success',
        message: `Business graded successfully! Score: ${scoreAsPercentage}%`,
        type: 'success'
      });
      
      return data;
    } catch (error) {
      console.error('Failed to grade business:', error);
      setAlertModal({
        isOpen: true,
        title: 'Error',
        message: 'Failed to grade business. Please try again.',
        type: 'error'
      });
    } finally {
      setGradingPlaceId(null);
    }
  };

  // Function to open/view the grader report
  const viewGraderReport = async (reportId: string, businessName: string) => {
    if (!reportId) return;
    
    try {
      // Open the report in a new tab
      window.open(`/api/grade-report/${reportId}`, '_blank');
    } catch (error) {
      console.error('Failed to view report:', error);
    }
  };

  const applyFilters = () => {
    let filtered = [...places];

    console.log('[PlacesPage] Applying filters:', {
      searchTerm,
      typeFilter,
      ratingFilter,
      locationFilter,
      enrichedFilter,
      icpScoreFilter,
      totalPlaces: places.length
    });

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const beforeSearch = filtered.length;
      filtered = filtered.filter(place =>
        place.name.toLowerCase().includes(term) ||
        place.address.toLowerCase().includes(term) ||
        place.website?.toLowerCase().includes(term) ||
        place.phone?.toLowerCase().includes(term) ||
        place.emails?.some(email => email.toLowerCase().includes(term))
      );
      console.log(`[PlacesPage] Search filter: ${beforeSearch} -> ${filtered.length} results`);
    }

    // Type filter
    if (typeFilter) {
      const beforeType = filtered.length;
      filtered = filtered.filter(place =>
        place.types?.some(type => type.toLowerCase().includes(typeFilter.toLowerCase()))
      );
      console.log(`[PlacesPage] Type filter: ${beforeType} -> ${filtered.length} results`);
    }

    // Rating filter
    if (ratingFilter) {
      const rating = parseFloat(ratingFilter);
      const beforeRating = filtered.length;
      filtered = filtered.filter(place => place.rating && place.rating >= rating);
      console.log(`[PlacesPage] Rating filter: ${beforeRating} -> ${filtered.length} results`);
    }

    // Location filter
    if (locationFilter) {
      const beforeLocation = filtered.length;
      filtered = filtered.filter(place =>
        place.locationNames?.some(location => 
          location.toLowerCase().includes(locationFilter.toLowerCase())
        )
      );
      console.log(`[PlacesPage] Location filter: ${beforeLocation} -> ${filtered.length} results`);
    }

    // Enriched filter
    if (enrichedFilter) {
      const beforeEnriched = filtered.length;
      const isEnriched = enrichedFilter === 'true';
      filtered = filtered.filter(place => {
        // Handle null/undefined enriched values
        const placeEnriched = place.enriched === true;
        return placeEnriched === isEnriched;
      });
      console.log(`[PlacesPage] Enriched filter: ${beforeEnriched} -> ${filtered.length} results (enriched=${isEnriched})`);
    }

    // ICP Score filter
    if (icpScoreFilter) {
      const beforeIcp = filtered.length;
      if (icpScoreFilter === 'has_score') {
        filtered = filtered.filter(place => 
          (place.icpScores?.midmarket?.score !== undefined && place.icpScores.midmarket.score !== null) ||
          (place.icpScores?.independent?.score !== undefined && place.icpScores.independent.score !== null)
        );
      } else if (icpScoreFilter === 'no_score') {
        filtered = filtered.filter(place => 
          (!place.icpScores?.midmarket || place.icpScores.midmarket.score === null || place.icpScores.midmarket.score === undefined) &&
          (!place.icpScores?.independent || place.icpScores.independent.score === null || place.icpScores.independent.score === undefined)
        );
      } else if (icpScoreFilter === 'high') {
        // High score >= 7
        filtered = filtered.filter(place => {
          const mmScore = place.icpScores?.midmarket?.score;
          const indScore = place.icpScores?.independent?.score;
          const maxScore = Math.max(mmScore ?? -1, indScore ?? -1);
          return maxScore >= 7;
        });
      } else if (icpScoreFilter === 'medium') {
        // Medium score 5-7
        filtered = filtered.filter(place => {
          const mmScore = place.icpScores?.midmarket?.score;
          const indScore = place.icpScores?.independent?.score;
          const maxScore = Math.max(mmScore ?? -1, indScore ?? -1);
          return maxScore >= 5 && maxScore < 7;
        });
      } else if (icpScoreFilter === 'low') {
        // Low score < 5
        filtered = filtered.filter(place => {
          const mmScore = place.icpScores?.midmarket?.score;
          const indScore = place.icpScores?.independent?.score;
          const maxScore = Math.max(mmScore ?? -1, indScore ?? -1);
          return maxScore >= 0 && maxScore < 5;
        });
      }
      console.log(`[PlacesPage] ICP Score filter: ${beforeIcp} -> ${filtered.length} results (filter=${icpScoreFilter})`);
    }

    // Sort
    filtered.sort((a, b) => {
      // Handle ICP Score sorting separately
      if (sortField === 'icpScore') {
        // Get the highest ICP score for each place (considering both midmarket and independent)
        const aMaxScore = Math.max(
          a.icpScores?.midmarket?.score ?? -1,
          a.icpScores?.independent?.score ?? -1
        );
        const bMaxScore = Math.max(
          b.icpScores?.midmarket?.score ?? -1,
          b.icpScores?.independent?.score ?? -1
        );
        
        // Places without scores go to the end
        if (aMaxScore === -1 && bMaxScore === -1) return 0;
        if (aMaxScore === -1) return 1;
        if (bMaxScore === -1) return -1;
        
        return sortDirection === 'asc' ? aMaxScore - bMaxScore : bMaxScore - aMaxScore;
      }
      
      const aValue = a[sortField as keyof Place];
      const bValue = b[sortField as keyof Place];
      
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      return 0;
    });

    setFilteredPlaces(filtered);
    setCurrentPage(1);
  };

  const handleSort = (field: keyof Place | 'icpScore') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Checkbox handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(paginatedPlaces.map(place => place.placeId));
      setSelectedPlaceIds(allIds);
    } else {
      setSelectedPlaceIds(new Set());
    }
  };

  const handleSelectPlace = (placeId: string, checked: boolean) => {
    const newSelected = new Set(selectedPlaceIds);
    if (checked) {
      newSelected.add(placeId);
    } else {
      newSelected.delete(placeId);
    }
    setSelectedPlaceIds(newSelected);
  };

  const handleBulkDelete = async () => {
    if (selectedPlaceIds.size === 0) return;

    setAlertModal({
      isOpen: true,
      title: 'Confirm Deletion',
      message: `Are you sure you want to delete ${selectedPlaceIds.size} business(es)? This action cannot be undone.`,
      type: 'confirm',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setIsDeleting(true);
        try {
          const response = await fetch('/api/businesses/delete', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ placeIds: Array.from(selectedPlaceIds) }),
          });

          if (!response.ok) {
            throw new Error('Failed to delete businesses');
          }

          const result = await response.json();
          
          // Refresh the places list
          await fetchPlaces();
          
          // Clear selection
          setSelectedPlaceIds(new Set());
          
          setAlertModal({
            isOpen: true,
            title: 'Success',
            message: result.message,
            type: 'success'
          });
        } catch (error) {
          console.error('Error deleting businesses:', error);
          setAlertModal({
            isOpen: true,
            title: 'Error',
            message: 'Failed to delete businesses. Please try again.',
            type: 'error'
          });
        } finally {
          setIsDeleting(false);
        }
      }
    });
  };

  const handleDeleteBusiness = async (place: Place) => {
    setAlertModal({
      isOpen: true,
      title: 'Confirm Deletion',
      message: `Are you sure you want to delete "${place.name}"? This action cannot be undone.`,
      type: 'confirm',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          const response = await fetch('/api/businesses/delete', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ placeIds: [place.placeId] }),
          });

          if (!response.ok) {
            throw new Error('Failed to delete business');
          }

          // Refresh the places list
          await fetchPlaces();
          
          // Remove from selection if it was selected
          if (selectedPlaceIds.has(place.placeId)) {
            const newSelected = new Set(selectedPlaceIds);
            newSelected.delete(place.placeId);
            setSelectedPlaceIds(newSelected);
          }
          
          setAlertModal({
            isOpen: true,
            title: 'Success',
            message: `"${place.name}" has been deleted successfully.`,
            type: 'success'
          });
        } catch (error) {
          console.error('Error deleting business:', error);
          setAlertModal({
            isOpen: true,
            title: 'Error',
            message: 'Failed to delete business. Please try again.',
            type: 'error'
          });
        }
      }
    });
  };

  const exportToCSV = () => {
    const headers = [
      'Name', 'Address', 'Website', 'Phone', 'Emails', 'Types', 
      'Rating', 'Total Ratings', 'Number of Locations', 'Location Names',
      'Country', 'Enriched', 'Added At'
    ];

    const csvData = filteredPlaces.map(place => [
      `${place.name} - ${place.address}`,
      place.website || '',
      place.phone || '',
      place.emails?.join('; ') || '',
      place.types?.join(', ') || '',
      place.rating || '',
      place.userRatingsTotal || '',
      place.numLocations || '',
      place.locationNames?.join(', ') || '',
      place.country || '',
      place.enriched ? 'Yes' : 'No',
      new Date(place.addedAt).toLocaleDateString()
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `places-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getUniqueTypes = () => {
    const types = new Set<string>();
    places.forEach(place => {
      place.types?.forEach(type => types.add(type));
    });
    return Array.from(types).sort();
  };

  const getUniqueLocations = () => {
    const locations = new Set<string>();
    places.forEach(place => {
      place.locationNames?.forEach(location => locations.add(location));
    });
    return Array.from(locations).sort();
  };

  const openDecisionMakersModal = (place: Place) => {
    setSelectedPlace(place);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedPlace(null);
  };

  const openLocationsModal = (place: Place) => {
    setSelectedLocationPlace(place);
    setIsLocationsModalOpen(true);
  };

  const closeLocationsModal = () => {
    setIsLocationsModalOpen(false);
    setSelectedLocationPlace(null);
  };

  const openTypesModal = (place: Place) => {
    setSelectedTypesPlace(place);
    setIsTypesModalOpen(true);
  };

  const closeTypesModal = () => {
    setIsTypesModalOpen(false);
    setSelectedTypesPlace(null);
  };

  const paginatedPlaces = filteredPlaces.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredPlaces.length / itemsPerPage);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="w-full mx-auto">
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading places...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="w-full mx-auto">
          <div className="text-center py-8">
            <p className="text-red-600">Error: {error}</p>
            <button
              onClick={fetchPlaces}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="w-full mx-auto">

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">Total Places</div>
            <div className="text-2xl font-bold">{places.length}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">Filtered</div>
            <div className="text-2xl font-bold">{filteredPlaces.length}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">Enriched</div>
            <div className="text-2xl font-bold">
              {places.filter(p => p.enriched).length}
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">With Locations</div>
            <div className="text-2xl font-bold">
              {places.filter(p => p.numLocations && p.numLocations > 1).length}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <Filter className="w-5 h-5 mr-2 text-gray-600" />
              <h2 className="text-lg font-semibold">Filters</h2>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
              <button
                onClick={exportToCSV}
                className="flex items-center px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={selectedPlaceIds.size === 0 || isDeleting}
                className="flex items-center px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete ({selectedPlaceIds.size})
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Name, address, website..."
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type
              </label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Types</option>
                {getUniqueTypes().map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* Rating Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Min Rating
              </label>
              <select
                value={ratingFilter}
                onChange={(e) => setRatingFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Any Rating</option>
                <option value="4.5">4.5+</option>
                <option value="4.0">4.0+</option>
                <option value="3.5">3.5+</option>
                <option value="3.0">3.0+</option>
              </select>
            </div>

            {/* ICP Score Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ICP Score
              </label>
              <select
                value={icpScoreFilter}
                onChange={(e) => setIcpScoreFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                <option value="has_score">Has Score</option>
                <option value="no_score">No Score</option>
                <option value="high">High (≥7)</option>
                <option value="medium">Medium (5-7)</option>
                <option value="low">Low (&lt;5)</option>
              </select>
            </div>

            {/* Location Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Location
              </label>
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Locations</option>
                {getUniqueLocations().map(location => (
                  <option key={location} value={location}>{location}</option>
                ))}
              </select>
            </div>

            {/* Enriched Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Enriched
              </label>
              <select
                value={enrichedFilter}
                onChange={(e) => setEnrichedFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                <option value="true">Enriched Only</option>
                <option value="false">Not Enriched</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selectedPlaceIds.size > 0 && selectedPlaceIds.size === paginatedPlaces.length}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('name')}>
                    <div className="flex items-center">
                      Name
                      {sortField === 'name' && (
                        sortDirection === 'asc' ? <SortAsc className="w-4 h-4 ml-1" /> : <SortDesc className="w-4 h-4 ml-1" />
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('icpScore')}>
                    <div className="flex items-center">
                      ICP Score
                      {sortField === 'icpScore' && (
                        sortDirection === 'asc' ? <SortAsc className="w-4 h-4 ml-1" /> : <SortDesc className="w-4 h-4 ml-1" />
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('rating')}>
                    <div className="flex items-center">
                      Rating
                      {sortField === 'rating' && (
                        sortDirection === 'asc' ? <SortAsc className="w-4 h-4 ml-1" /> : <SortDesc className="w-4 h-4 ml-1" />
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('numLocations')}>
                    <div className="flex items-center">
                      Locations
                      {sortField === 'numLocations' && (
                        sortDirection === 'asc' ? <SortAsc className="w-4 h-4 ml-1" /> : <SortDesc className="w-4 h-4 ml-1" />
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('country')}>
                    <div className="flex items-center">
                      Country
                      {sortField === 'country' && (
                        sortDirection === 'asc' ? <SortAsc className="w-4 h-4 ml-1" /> : <SortDesc className="w-4 h-4 ml-1" />
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Grader</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Types</th>
                  {/* <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('enriched')}>
                    <div className="flex items-center">
                      Apollo DMs
                      {sortField === 'enriched' && (
                        sortDirection === 'asc' ? <SortAsc className="w-4 h-4 ml-1" /> : <SortDesc className="w-4 h-4 ml-1" />
                      )}
                    </div>
                  </th> */}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('addedAt')}>
                    <div className="flex items-center">
                      Added
                      {sortField === 'addedAt' && (
                        sortDirection === 'asc' ? <SortAsc className="w-4 h-4 ml-1" /> : <SortDesc className="w-4 h-4 ml-1" />
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedPlaces.map((place) => (
                  <tr key={place.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedPlaceIds.has(place.placeId)}
                        onChange={(e) => handleSelectPlace(place.placeId, e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3" style={{ maxWidth: '250px' }}>
                      <a
                        href={`https://www.google.com/maps/place/?q=place_id:${place.placeId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap overflow-hidden text-ellipsis block"
                      >
                        {place.name}
                      </a>
                      <div className="text-xs text-gray-500 line-clamp-2">{place.address}</div>
                      <div className="flex items-center gap-3 mt-1">
                        {place.website && (
                          <a
                            href={place.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            🌐 Website
                          </a>
                        )}
                        {place.phone && (
                          <span className="text-xs text-gray-600">
                            📞 {place.phone}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        {place.icpScores?.midmarket?.score !== undefined && place.icpScores.midmarket.score !== null ? (
                          <button
                            onClick={() => setIcpBreakdownModal({
                              isOpen: true,
                              type: 'midmarket',
                              breakdown: place.icpScores?.midmarket?.breakdown,
                              score: place.icpScores?.midmarket?.score || 0,
                              businessName: place.name,
                              category: place.types?.[0] || null,
                              website: place.website || null
                            })}
                            className={`px-2 py-1 rounded text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${
                              place.icpScores.midmarket.score >= 7 ? 'bg-green-100 text-green-800' :
                              place.icpScores.midmarket.score >= 5 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}
                            title="Click to see MidMarket breakdown"
                          >
                            MM: {place.icpScores.midmarket.score.toFixed(1)}/10
                          </button>
                        ) : null}
                        {place.icpScores?.independent?.score !== undefined && place.icpScores.independent.score !== null ? (
                          <button
                            onClick={() => setIcpBreakdownModal({
                              isOpen: true,
                              type: 'independent',
                              breakdown: place.icpScores?.independent?.breakdown,
                              score: place.icpScores?.independent?.score || 0,
                              businessName: place.name,
                              category: place.types?.[0] || null,
                              website: place.website || null
                            })}
                            className={`px-2 py-1 rounded text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${
                              place.icpScores.independent.score >= 7 ? 'bg-green-100 text-green-800' :
                              place.icpScores.independent.score >= 5 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}
                            title="Click to see Independent breakdown"
                          >
                            Ind: {place.icpScores.independent.score.toFixed(1)}/10
                          </button>
                        ) : null}
                        {(!place.icpScores?.midmarket || place.icpScores.midmarket.score === null || place.icpScores.midmarket.score === undefined) && 
                         (!place.icpScores?.independent || place.icpScores.independent.score === null || place.icpScores.independent.score === undefined) && (
                          <span className="text-gray-400 text-xs">N/A</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-xs text-gray-900">
                        {place.rating ? (
                          <span className="flex items-center">
                            <span className="text-yellow-500">★</span>
                            <span className="ml-1">{place.rating}</span>
                            {place.userRatingsTotal && (
                              <span className="text-gray-500 ml-1">({place.userRatingsTotal})</span>
                            )}
                          </span>
                        ) : '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-xs text-gray-900">
                        {place.numLocations && place.numLocations >= 1 ? (
                          <button
                            onClick={() => openLocationsModal(place)}
                            className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs hover:bg-blue-200 cursor-pointer transition-colors"
                          >
                            {place.numLocations} {place.numLocations === 1 ? 'location' : 'locations'}
                          </button>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-xs text-gray-900">
                        {place.country || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      {place.graderScore !== undefined && place.graderScore !== null ? (
                        <div className="flex flex-row items-center justify-center gap-2">
                          <span className={`text-xs font-medium ${
                            place.graderScore >= 70 ? 'text-green-600' : 
                            place.graderScore >= 40 ? 'text-amber-600' : 
                            'text-red-600'
                          }`}>
                            {place.graderScore}%
                          </span>
                          {place.reportId && (
                            <button
                              onClick={() => viewGraderReport(place.reportId!, place.name)}
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
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-xs text-gray-900">
                        {place.types && place.types.length > 0 ? (
                          <button
                            onClick={() => openTypesModal(place)}
                            className="text-left hover:bg-gray-50 rounded px-2 py-1 transition-colors cursor-pointer"
                          >
                            <div className="text-xs font-medium text-gray-900">
                              {place.types[0]}
                            </div>
                            {place.types.length > 1 && (
                              <div className="text-xs text-purple-600 font-medium mt-0.5">
                                +{place.types.length - 1} more
                              </div>
                            )}
                          </button>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </div>
                    </td>
                    {/* <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-xs text-gray-900">
                        {place.decisionMakers && place.decisionMakers.length > 0 ? (
                          <button
                            onClick={() => openDecisionMakersModal(place)}
                            className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs hover:bg-blue-200 cursor-pointer transition-colors"
                          >
                            {place.decisionMakers.length}
                          </button>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </div>
                    </td> */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-xs text-gray-900">
                        {new Date(place.addedAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {/* Enrich Button */}
                        <button
                          onClick={() => enrichPlacesData(place)}
                          disabled={enrichingPlaceId === place.placeId}
                          className={`p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                            place.enriched 
                              ? 'bg-green-100 text-green-600 hover:bg-green-200' 
                              : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                          }`}
                          title={place.enriched ? "Re-enrich business" : "Enrich business"}
                        >
                          {enrichingPlaceId === place.placeId ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Map className="h-4 w-4" />
                          )}
                        </button>
                        
                        {/* Calculate ICP Score Button */}
                        <button
                          onClick={() => handleCalculateICP(place)}
                          disabled={refreshing}
                          className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Calculate ICP Score"
                        >
                          <Calculator className="h-4 w-4" />
                        </button>

                        {/* Grader Button */}
                        <button
                          onClick={() => gradeBusinessQuality(place)}
                          disabled={gradingPlaceId === place.placeId}
                          className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Grade business quality"
                        >
                          {gradingPlaceId === place.placeId ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Star className="h-4 w-4" />
                          )}
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => handleDeleteBusiness(place)}
                          disabled={refreshing}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete business"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-6">
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-700">
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredPlaces.length)} of {filteredPlaces.length} results
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-700">Show:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-sm text-gray-700">per page</span>
            </div>
          </div>
          
          {totalPages > 1 && (
            <div className="flex space-x-2">
              <button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-2 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Previous
              </button>
              <span className="px-3 py-2 text-sm text-gray-700">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-3 py-2 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Decision Makers Modal */}
        {isModalOpen && selectedPlace && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">
                  Apollo Decision Makers - {selectedPlace.name}
                </h2>
                <button
                  onClick={closeModal}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-6">
                {selectedPlace.decisionMakers && selectedPlace.decisionMakers.length > 0 ? (
                  <div className="space-y-4">
                    {selectedPlace.decisionMakers.map((dm: any, index: number) => (
                      <div key={index} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="text-lg font-medium text-gray-900">{dm.name}</h3>
                            <p className="text-sm text-gray-600 mt-1">{dm.title}</p>
                            
                            {dm.email && (
                              <div className="flex items-center mt-2">
                                <Mail className="w-4 h-4 text-gray-400 mr-2" />
                                <span className="text-sm text-gray-700">{dm.email}</span>
                                {dm.email_status === 'verified' && (
                                  <span className="ml-2 bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                                    Verified
                                  </span>
                                )}
                              </div>
                            )}
                            
                            {dm.linkedin_url && (
                              <div className="flex items-center mt-2">
                                <ExternalLink className="w-4 h-4 text-gray-400 mr-2" />
                                <a
                                  href={dm.linkedin_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                  LinkedIn Profile
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No decision makers found for this business.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Locations Modal */}
        {isLocationsModalOpen && selectedLocationPlace && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">
                  Brand Locations - {selectedLocationPlace.name}
                </h2>
                <button
                  onClick={closeLocationsModal}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-6">
                {selectedLocationPlace.locationNames && selectedLocationPlace.locationNames.length > 0 ? (
                  <div className="space-y-4">
                    <div className="mb-4">
                      <p className="text-sm text-gray-600">
                        This business has <span className="font-medium">{selectedLocationPlace.numLocations}</span> location(s):
                      </p>
                    </div>
                    {selectedLocationPlace.locationNames.map((location: string, index: number) => (
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

        {/* Types Modal */}
        {isTypesModalOpen && selectedTypesPlace && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">
                  Business Types - {selectedTypesPlace.name}
                </h2>
                <button
                  onClick={closeTypesModal}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-6">
                {selectedTypesPlace.types && selectedTypesPlace.types.length > 0 ? (
                  <div className="space-y-4">
                    <div className="mb-4">
                      <p className="text-sm text-gray-600">
                        This business is categorized as <span className="font-medium">{selectedTypesPlace.types.length}</span> type(s):
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      {selectedTypesPlace.types.map((type: string, index: number) => (
                        <div key={index} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-center">
                            <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs mr-3 font-medium">
                              {index + 1}
                            </span>
                            <span className="text-sm font-medium text-gray-900">{type}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No type information available for this business.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ICP Breakdown Modal */}
        {icpBreakdownModal.isOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-[883px] w-full mx-4 max-h-[90vh] overflow-y-auto">
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
                        // Skip "No Website" for Independent breakdown
                        if (key === 'noWebsite' && icpBreakdownModal.type === 'independent') {
                          return null;
                        }
                        
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
      </div>
    </div>
    {/* Progress Modal for Enrichment & ICP Calculation */}
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
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    )}

    {/* Clone Enrichment Confirmation Modal */}
    {cloneModal.isOpen && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">
              Clone Enrichment Data
            </h2>
            <button
              onClick={() => setCloneModal({ ...cloneModal, isOpen: false })}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <div className="p-6">
            <p className="text-sm text-gray-600 mb-4">
              Found similar businesses that might be part of the same brand as <span className="font-semibold">{cloneModal.sourceName}</span>. Select which businesses should have the enrichment data cloned to them:
            </p>
            
            <div className="space-y-3 mb-6">
              {cloneModal.fuzzyMatches.map((match) => (
                <div key={match.placeId} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <label className="flex items-start cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cloneModal.selectedMatches.includes(match.placeId)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setCloneModal({
                            ...cloneModal,
                            selectedMatches: [...cloneModal.selectedMatches, match.placeId]
                          });
                        } else {
                          setCloneModal({
                            ...cloneModal,
                            selectedMatches: cloneModal.selectedMatches.filter(id => id !== match.placeId)
                          });
                        }
                      }}
                      className="mt-1 mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900">{match.name}</span>
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                          {match.similarity}% match
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">{match.address}</p>
                    </div>
                  </label>
                </div>
              ))}
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setCloneModal({ ...cloneModal, isOpen: false })}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleCloneEnrichment}
                disabled={cloneModal.selectedMatches.length === 0}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Clone to {cloneModal.selectedMatches.length} business{cloneModal.selectedMatches.length !== 1 ? 'es' : ''}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Enrichment Progress Modal */}
    {enrichmentProgress.isOpen && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6 h-[650px] flex flex-col">
          <div className="mb-4 flex-shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-lg font-semibold text-gray-900">
                {enrichmentProgress.currentStep === enrichmentProgress.totalSteps 
                  ? `Successfully enriched ${enrichmentProgress.businessName}` 
                  : `Enriching ${enrichmentProgress.businessName}`}
              </h3>
            </div>
            
            {/* Progress Bar */}
            <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
              <div 
                className={`h-3 rounded-full transition-all duration-300 ease-out ${
                  enrichmentProgress.currentStep === enrichmentProgress.totalSteps 
                    ? 'bg-green-600' 
                    : 'bg-blue-600'
                }`}
                style={{ 
                  width: `${(enrichmentProgress.currentStep / enrichmentProgress.totalSteps) * 100}%` 
                }}
              ></div>
            </div>
            
            <div className="flex justify-between text-xs text-gray-600">
              <span>
                {enrichmentProgress.currentStep === enrichmentProgress.totalSteps 
                  ? 'Complete!' 
                  : `Step ${enrichmentProgress.currentStep} of ${enrichmentProgress.totalSteps}`}
              </span>
              <span>{Math.round((enrichmentProgress.currentStep / enrichmentProgress.totalSteps) * 100)}%</span>
            </div>
          </div>
          
          <div className="bg-gray-50 rounded-lg p-4 flex-1 overflow-y-auto">
            <div className="space-y-3 font-mono text-sm">
              {(() => {
                // Filter out "Starting enrichment..." message
                const filteredMessages = enrichmentProgress.messages.filter(msg => 
                  !msg.toLowerCase().includes('starting enrichment')
                );
                
                // Group messages into steps (main message + its result + indented sub-messages)
                const steps: Array<{main: string; result?: string; details: string[]; isSuccess: boolean}> = [];
                let currentStep: {main: string; result?: string; details: string[]; isSuccess: boolean} | null = null;
                
                filteredMessages.forEach((message) => {
                  const isIndented = message.startsWith('  ');
                  const cleanMessage = message.replace(/^[✓→\s]+/, '').trim();
                  const isSuccess = message.includes('✓');
                  
                  // Check if this is a result/conclusion message (starts with "Found", "Total", "Analysis complete", etc.)
                  const isResultMessage = isSuccess && (
                    cleanMessage.startsWith('Found') || 
                    cleanMessage.startsWith('Total') ||
                    cleanMessage.startsWith('Analysis complete') ||
                    cleanMessage.startsWith('Website loaded') ||
                    cleanMessage.startsWith('Cloned to') ||
                    cleanMessage.startsWith('Enrichment completed')
                  );
                  
                  if (!isIndented) {
                    if (isResultMessage && currentStep) {
                      // This is a result for the current step
                      currentStep.result = cleanMessage;
                      currentStep.isSuccess = true; // Mark the step as successful
                    } else {
                      // Start a new step
                      if (currentStep) {
                        steps.push(currentStep);
                      }
                      currentStep = { main: cleanMessage, details: [], isSuccess };
                    }
                  } else if (currentStep) {
                    // Add detail to current step
                    currentStep.details.push(cleanMessage);
                  }
                });
                
                // Add the last step
                if (currentStep) {
                  steps.push(currentStep);
                }
                
                // Render each step in its own container
                return steps.map((step, index) => (
                  <div key={index} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                    {/* Main step message */}
                    <div className="flex items-start gap-2">
                      <span className={step.isSuccess ? 'text-green-600 mt-1' : 'text-blue-600 mt-1'}>
                        {step.isSuccess ? '✓' : '→'}
                      </span>
                      <div className="flex-1">
                        <div className="text-gray-900 font-medium">
                          {step.main}
                        </div>
                        {/* Result message (if any) */}
                        {step.result && (
                          <div className="text-green-700 text-sm mt-1">
                            {step.result}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Detail messages */}
                    {step.details.length > 0 && (
                      <div className="ml-6 mt-2 space-y-1">
                        {step.details.map((detail, detailIndex) => (
                          <div key={detailIndex} className="text-gray-600 text-xs">
                            {detail}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ));
              })()}
            </div>
          </div>
          
          {enrichmentProgress.currentStep === enrichmentProgress.totalSteps && (
            <div className="mt-4 flex justify-center flex-shrink-0">
              <button
                onClick={() => setEnrichmentProgress({ isOpen: false, businessName: '', messages: [], currentStep: 0, totalSteps: 6 })}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    )}

    <AlertModal
      isOpen={alertModal.isOpen}
      onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
      onConfirm={alertModal.onConfirm}
      title={alertModal.title}
      message={alertModal.message}
      type={alertModal.type}
      confirmText={alertModal.confirmText}
      cancelText={alertModal.cancelText}
    />
    </>
  );
};

export default PlacesPage; 