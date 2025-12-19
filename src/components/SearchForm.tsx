import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Search, MapPin } from 'lucide-react';
import { Business, Location } from '../types';

interface SearchFormProps {
  onResults: (businesses: Business[]) => void;
  setIsLoading: (setIsLoading: boolean) => void;
  includeApollo: boolean;
  setIncludeApollo: (include: boolean) => void;
}

type SearchMode = 'type' | 'name';

const SearchForm: React.FC<SearchFormProps> = ({
  onResults,
  setIsLoading,
  includeApollo,
  setIncludeApollo,
}) => {
  const [searchMode, setSearchMode] = useState<SearchMode>('type');
  const [keyword, setKeyword] = useState('coffee shops');
  const [location, setLocation] = useState('austin');
  const [placeName, setPlaceName] = useState('Temple Craft Recoleta');
  const [predictions, setPredictions] = useState<any[]>([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<{ name: string; placeId: string } | null>(null);
  const autocompleteService = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load Google Maps API dynamically (with global loading flag)
  useEffect(() => {
    const loadGoogleMapsScript = () => {
      // Check if Google Maps is already loaded
      if ((window as any).google) {
        return;
      }

      // Check if script is already being loaded or exists in DOM
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (existingScript) {
        return;
      }

      // Check if we're already loading (prevent concurrent requests)
      if ((window as any).__googleMapsLoading) {
        return;
      }

      // Set loading flag
      (window as any).__googleMapsLoading = true;

      // Fetch API key from backend
      fetch('http://localhost:3001/api/google-api-key')
        .then(res => res.json())
        .then(data => {
          if (data.apiKey) {
            // Double-check again before adding (race condition protection)
            const scriptCheck = document.querySelector('script[src*="maps.googleapis.com"]');
            if (scriptCheck) {
              (window as any).__googleMapsLoading = false;
              return;
            }

            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${data.apiKey}&libraries=places&loading=async`;
            script.async = true;
            script.defer = true;
            script.onload = () => {
              (window as any).__googleMapsLoading = false;
            };
            script.onerror = () => {
              (window as any).__googleMapsLoading = false;
            };
            document.head.appendChild(script);
          } else {
            (window as any).__googleMapsLoading = false;
          }
        })
        .catch(err => {
          console.error('Failed to load Google Maps API key:', err);
          (window as any).__googleMapsLoading = false;
        });
    };

    loadGoogleMapsScript();
  }, []);

  // Initialize Google Places Autocomplete
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).google && searchMode === 'name') {
      autocompleteService.current = new (window as any).google.maps.places.AutocompleteService();
    }
  }, [searchMode]);

  // Handle place name input
  const handlePlaceNameChange = (value: string) => {
    setPlaceName(value);
    setSelectedPlace(null);

    if (value.length > 2 && autocompleteService.current) {
      autocompleteService.current.getPlacePredictions(
        {
          input: value,
          types: ['establishment'],
        },
        (predictions: any[], status: any) => {
          if (status === (window as any).google.maps.places.PlacesServiceStatus.OK && predictions) {
            setPredictions(predictions);
            setShowPredictions(true);
          } else {
            setPredictions([]);
          }
        }
      );
    } else {
      setPredictions([]);
      setShowPredictions(false);
    }
  };

  // Handle place selection
  const handlePlaceSelect = (prediction: any) => {
    setSelectedPlace({
      name: prediction.description,
      placeId: prediction.place_id
    });
    setPlaceName(prediction.description);
    setShowPredictions(false);
    setPredictions([]);
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsLoading(true);
    try {
      let response;
      
      if (searchMode === 'name' && selectedPlace) {
        // Search by place ID
        response = await fetch(`http://localhost:3001/api/search-by-place-id`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ placeId: selectedPlace.placeId, includeApollo }),
        });
      } else {
        // Search by type and location
        response = await fetch(`http://localhost:3001/api/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ keyword, location, includeApollo }),
        });
      }
      
      const data = await response.json();

      // Transform the data to the new Business structure
      const transformedData: Business[] = (data.businesses || []).map((item: any) => {
        const firstLocation: Location = {
          id: item.placeId, // Assuming placeId can serve as a unique ID for the main location
          address: item.address,
          website: item.website,
          phone: item.phone,
          emails: item.emails || []
        };
        
        
        return {
          id: item.id,
          name: item.name,
          placeId: item.placeId,
          locations: [firstLocation],
          decisionMakers: item.decisionMakers || [],
          category: item.category,
          types: item.types,
          rating: item.rating,
          userRatingsTotal: item.userRatingsTotal,
          apolloStatus: 'pending',
          graderReport: null,
          addedAt: item.addedAt || new Date().toISOString(),
          enrichedAt: item.enrichedAt || null, // Include enrichedAt from database
          numLocations: item.numLocations || 1, // Include numLocations from database
          locationNames: item.locationNames || [], // Include locationNames from database
        };
      });
      
      onResults(transformedData);
    } catch (error) {
      console.error('Failed to search businesses:', error);
      onResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickSearches = [
    { keyword: 'coffee shops', location: 'austin' },
    { keyword: 'restaurants', location: 'miami' },
    { keyword: 'gyms', location: 'denver' },
    { keyword: 'salons', location: 'portland' }
  ];

  const handleQuickSearch = (k: string, l: string) => {
    setKeyword(k);
    setLocation(l);
    handleSearch();
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">Find restaurants</h2>
      
      {/* Search Mode Toggle */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Search Method</label>
        <div className="flex bg-gray-100 rounded-lg p-1 w-fit" role="group">
          <button
            type="button"
            onClick={() => setSearchMode('type')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
              searchMode === 'type'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            By Type
          </button>
          <button
            type="button"
            onClick={() => setSearchMode('name')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
              searchMode === 'name'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            By Name
          </button>
        </div>
      </div>

      <form onSubmit={handleSearch} className="space-y-4">
        {searchMode === 'type' ? (
          <>
            <div>
              <label htmlFor="business-type" className="block text-sm font-medium text-gray-700 mb-1">Business Type</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="business-type"
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="e.g., coffee shops"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="location"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g., Austin"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </>
        ) : (
          <div>
            <label htmlFor="place-name" className="block text-sm font-medium text-gray-700 mb-1">
              Business Name
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                ref={inputRef}
                id="place-name"
                type="text"
                value={placeName}
                onChange={(e) => handlePlaceNameChange(e.target.value)}
                onFocus={() => predictions.length > 0 && setShowPredictions(true)}
                onBlur={() => setTimeout(() => setShowPredictions(false), 200)}
                placeholder="e.g., Starbucks Austin Downtown"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-[11px]"
              />
              
              {/* Autocomplete Predictions */}
              {showPredictions && predictions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {predictions.map((prediction) => (
                    <button
                      key={prediction.place_id}
                      type="button"
                      onClick={() => handlePlaceSelect(prediction)}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0"
                    >
                      <div className="flex items-start">
                        <MapPin className="h-4 w-4 text-gray-400 mt-1 mr-2 flex-shrink-0" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {prediction.structured_formatting.main_text}
                          </div>
                          <div className="text-xs text-gray-500">
                            {prediction.structured_formatting.secondary_text}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <input
              id="include-apollo"
              type="checkbox"
              onChange={(e) => setIncludeApollo(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="include-apollo" className="text-sm text-gray-700">
              Include Apollo contacts
            </label>
          </div>
        </div>
        
        <button
          type="submit"
          disabled={searchMode === 'type' ? (!keyword || !location) : !selectedPlace}
          className="w-full flex items-center justify-center bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Search className="h-5 w-5 mr-2" />
          {searchMode === 'type' ? 'Search' : 'Find Business'}
        </button>
      </form>
      
      <div className="mt-4">
        <button onClick={() => onResults([])} className="w-full text-center py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
          Clear Results
        </button>
      </div>
       <div className="mt-6">
        <h3 className="text-sm font-medium text-gray-500 mb-2">Quick searches:</h3>
        <div className="flex flex-wrap gap-2">
          {quickSearches.map((search, index) => (
            <button
              key={index}
              onClick={() => handleQuickSearch(search.keyword, search.location)}
              className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
            >
              {search.keyword} in {search.location}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SearchForm;