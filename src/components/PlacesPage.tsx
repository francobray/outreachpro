import React, { useState, useEffect } from 'react';
import { Search, Filter, Download, SortAsc, SortDesc, RefreshCw } from 'lucide-react';

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
  
  // Sort states
  const [sortField, setSortField] = useState<keyof Place>('addedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  useEffect(() => {
    fetchPlaces();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [places, searchTerm, typeFilter, ratingFilter, locationFilter, enrichedFilter, sortField, sortDirection]);

  useEffect(() => {
    setCurrentPage(1);
  }, [itemsPerPage]);

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
        sample: businesses.slice(0, 3).map(b => ({
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

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      const response = await fetch('/api/dashboard');
      if (!response.ok) {
        throw new Error('Failed to fetch places');
      }
      const data = await response.json();
      setPlaces(data.businesses || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch places');
    } finally {
      setRefreshing(false);
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

    // Sort
    filtered.sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      
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

  const handleSort = (field: keyof Place) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const exportToCSV = () => {
    const headers = [
      'Name', 'Address', 'Website', 'Phone', 'Emails', 'Types', 
      'Rating', 'Total Ratings', 'Number of Locations', 'Location Names',
      'Enriched', 'Added At'
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

  const paginatedPlaces = filteredPlaces.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredPlaces.length / itemsPerPage);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="w-[90%] mx-auto">
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
        <div className="w-[90%] mx-auto">
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
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="w-[90%] mx-auto">

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
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('name')}>
                    <div className="flex items-center">
                      Name
                      {sortField === 'name' && (
                        sortDirection === 'asc' ? <SortAsc className="w-4 h-4 ml-1" /> : <SortDesc className="w-4 h-4 ml-1" />
                      )}
                    </div>
                  </th>

                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Website</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('rating')}>
                    <div className="flex items-center">
                      Rating
                      {sortField === 'rating' && (
                        sortDirection === 'asc' ? <SortAsc className="w-4 h-4 ml-1" /> : <SortDesc className="w-4 h-4 ml-1" />
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('numLocations')}>
                    <div className="flex items-center">
                      Locations
                      {sortField === 'numLocations' && (
                        sortDirection === 'asc' ? <SortAsc className="w-4 h-4 ml-1" /> : <SortDesc className="w-4 h-4 ml-1" />
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Types</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('enriched')}>
                    <div className="flex items-center">
                      Enriched
                      {sortField === 'enriched' && (
                        sortDirection === 'asc' ? <SortAsc className="w-4 h-4 ml-1" /> : <SortDesc className="w-4 h-4 ml-1" />
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('addedAt')}>
                    <div className="flex items-center">
                      Added
                      {sortField === 'addedAt' && (
                        sortDirection === 'asc' ? <SortAsc className="w-4 h-4 ml-1" /> : <SortDesc className="w-4 h-4 ml-1" />
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedPlaces.map((place) => (
                  <tr key={place.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{place.name}</div>
                      <div className="text-sm text-gray-500">{place.address}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {place.website ? (
                        <a
                          href={place.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          {place.website.replace(/^https?:\/\//, '')}
                        </a>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{place.phone || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
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
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {place.numLocations ? (
                          <span className="flex items-center">
                            <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                              {place.numLocations}
                            </span>
                            {place.locationNames && place.locationNames.length > 0 && (
                              <span className="text-gray-500 ml-2 text-xs">
                                {place.locationNames.slice(0, 2).join(', ')}
                                {place.locationNames.length > 2 && '...'}
                              </span>
                            )}
                          </span>
                        ) : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {place.types && place.types.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {place.types.slice(0, 3).map((type, index) => (
                              <span
                                key={index}
                                className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs"
                              >
                                {type}
                              </span>
                            ))}
                            {place.types.length > 3 && (
                              <span className="text-gray-500 text-xs">+{place.types.length - 3}</span>
                            )}
                          </div>
                        ) : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {place.enriched ? (
                          <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                            Yes
                          </span>
                        ) : (
                          <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs">
                            No
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {new Date(place.addedAt).toLocaleDateString()}
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
      </div>
    </div>
  );
};

export default PlacesPage; 