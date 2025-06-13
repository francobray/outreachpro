import React, { useState } from 'react';
import { Search, MapPin, Tag, Loader2 } from 'lucide-react';

interface SearchFormProps {
  onResults: (results: any[]) => void;
  setIsLoading: (loading: boolean) => void;
}

const SearchForm: React.FC<SearchFormProps> = ({ onResults, setIsLoading }) => {
  const [location, setLocation] = useState('');
  const [keyword, setKeyword] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location.trim() || !keyword.trim()) return;

    setIsSearching(true);
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:3001/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ location: location.trim(), keyword: keyword.trim() }),
      });

      const data = await response.json();
      onResults(data.businesses || []);
    } catch (error) {
      console.error('Search failed:', error);
      onResults([]);
    } finally {
      setIsSearching(false);
      setIsLoading(false);
    }
  };

  const quickSearches = [
    { keyword: 'coffee shops', location: 'austin' },
    { keyword: 'restaurants', location: 'miami' },
    { keyword: 'gyms', location: 'denver' },
    { keyword: 'salons', location: 'portland' },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 h-fit">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Find Local Businesses</h2>
        <p className="text-gray-600">Search for businesses by location and category to start your outreach campaign.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <div>
            <label htmlFor="keyword" className="block text-sm font-medium text-gray-700 mb-2">
              Business Type
            </label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                id="keyword"
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g., coffee shops, restaurants, gyms"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isSearching}
              />
            </div>
          </div>

          <div>
            <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-2">
              Location
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                id="location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., Austin, Miami, Denver"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isSearching}
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSearching || !location.trim() || !keyword.trim()}
          className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
        >
          {isSearching ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Searching...</span>
            </>
          ) : (
            <>
              <Search className="h-5 w-5" />
              <span>Search Businesses</span>
            </>
          )}
        </button>
      </form>

      {/* Quick Search Options */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <p className="text-sm font-medium text-gray-700 mb-3">Quick searches:</p>
        <div className="grid grid-cols-1 gap-2">
          {quickSearches.map((search, index) => (
            <button
              key={index}
              onClick={() => {
                setKeyword(search.keyword);
                setLocation(search.location);
              }}
              className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-left"
              disabled={isSearching}
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