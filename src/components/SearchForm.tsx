import React, { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Business, Location } from '../types';

interface SearchFormProps {
  onResults: (businesses: Business[]) => void;
  setIsLoading: (setIsLoading: boolean) => void;
  includeApollo: boolean;
  setIncludeApollo: (include: boolean) => void;
}

const SearchForm: React.FC<SearchFormProps> = ({
  onResults,
  setIsLoading,
  includeApollo,
  setIncludeApollo,
}) => {
  const [keyword, setKeyword] = useState('coffee shops');
  const [location, setLocation] = useState('austin');

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ keyword, location, includeApollo }),
      });
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
      <h2 className="text-xl font-semibold mb-4 text-gray-800">Find Local Businesses</h2>
      <form onSubmit={handleSearch} className="space-y-4">
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
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <input
              id="include-apollo"
              type="checkbox"
              checked={includeApollo}
              onChange={(e) => setIncludeApollo(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="include-apollo" className="text-sm text-gray-700">
              Include Apollo contact lookup
            </label>
          </div>
        </div>
        
        <button
          type="submit"
          disabled={!keyword || !location}
          className="w-full flex items-center justify-center bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Search className="h-5 w-5 mr-2" />
          Search Businesses
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