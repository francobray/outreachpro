import React, { useState, useEffect } from 'react';
import { Search, Filter, Download, SortAsc, SortDesc, RefreshCw, X, ExternalLink, Mail, User, Building } from 'lucide-react';

interface ApolloContact {
  _id: string;
  id: string;
  businessId: string;
  placeId: string;
  name: string;
  title: string;
  email: string;
  linkedin_url: string;
  email_status: 'verified' | 'unverified';
  organization: {
    name: string;
    website?: string;
    address?: string;
  };
  createdAt: string;
  updatedAt: string;
}

const ContactsPage: React.FC = () => {
  const [contacts, setContacts] = useState<ApolloContact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<ApolloContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [emailStatusFilter, setEmailStatusFilter] = useState('');
  const [titleFilter, setTitleFilter] = useState('');
  const [businessFilter, setBusinessFilter] = useState('');
  
  // Sort states
  const [sortField, setSortField] = useState<keyof ApolloContact>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  useEffect(() => {
    fetchContacts();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [contacts, searchTerm, emailStatusFilter, titleFilter, businessFilter, sortField, sortDirection]);

  useEffect(() => {
    setCurrentPage(1);
  }, [itemsPerPage]);

  const fetchContacts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/dashboard');
      if (!response.ok) {
        throw new Error('Failed to fetch businesses');
      }
      const data = await response.json();
      const businesses = data.businesses || [];
      
      // Extract all decision makers from businesses
      const allContacts: ApolloContact[] = [];
      businesses.forEach(business => {
        if (business.decisionMakers && Array.isArray(business.decisionMakers)) {
          business.decisionMakers.forEach((dm: any) => {
            allContacts.push({
              _id: dm._id || `${business.id}-${dm.name}`,
              id: dm._id || `${business.id}-${dm.name}`,
              businessId: business.id,
              placeId: business.placeId,
              name: dm.name,
              title: dm.title || '',
              email: dm.email || '',
              linkedin_url: dm.linkedin_url || '',
              email_status: dm.email_status || 'unverified',
              organization: {
                name: business.name,
                website: business.website,
                address: business.address
              },
              createdAt: business.addedAt || business.createdAt,
              updatedAt: business.updatedAt || business.lastUpdated
            });
          });
        }
      });
      
      console.log('[ContactsPage] Fetched contacts from businesses:', {
        totalBusinesses: businesses.length,
        totalContacts: allContacts.length,
        businessesWithContacts: businesses.filter(b => b.decisionMakers && b.decisionMakers.length > 0).length,
        sample: allContacts.slice(0, 3).map(c => ({
          name: c.name,
          title: c.title,
          email: c.email,
          organization: c.organization?.name
        }))
      });
      
      setContacts(allContacts);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch contacts');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      const response = await fetch('/api/dashboard');
      if (!response.ok) {
        throw new Error('Failed to fetch businesses');
      }
      const data = await response.json();
      const businesses = data.businesses || [];
      
      // Extract all decision makers from businesses
      const allContacts: ApolloContact[] = [];
      businesses.forEach(business => {
        if (business.decisionMakers && Array.isArray(business.decisionMakers)) {
          business.decisionMakers.forEach((dm: any) => {
            allContacts.push({
              _id: dm._id || `${business.id}-${dm.name}`,
              id: dm._id || `${business.id}-${dm.name}`,
              businessId: business.id,
              placeId: business.placeId,
              name: dm.name,
              title: dm.title || '',
              email: dm.email || '',
              linkedin_url: dm.linkedin_url || '',
              email_status: dm.email_status || 'unverified',
              organization: {
                name: business.name,
                website: business.website,
                address: business.address
              },
              createdAt: business.addedAt || business.createdAt,
              updatedAt: business.updatedAt || business.lastUpdated
            });
          });
        }
      });
      
      setContacts(allContacts);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch contacts');
    } finally {
      setRefreshing(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...contacts];

    console.log('[ContactsPage] Applying filters:', {
      searchTerm,
      emailStatusFilter,
      titleFilter,
      businessFilter,
      totalContacts: contacts.length
    });

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const beforeSearch = filtered.length;
      filtered = filtered.filter(contact =>
        contact.name.toLowerCase().includes(term) ||
        contact.title.toLowerCase().includes(term) ||
        contact.email.toLowerCase().includes(term) ||
        (contact.organization?.name && contact.organization.name.toLowerCase().includes(term)) ||
        (contact.organization?.address && contact.organization.address.toLowerCase().includes(term))
      );
      console.log(`[ContactsPage] Search filter: ${beforeSearch} -> ${filtered.length} results`);
    }

    // Email status filter
    if (emailStatusFilter) {
      const beforeStatus = filtered.length;
      filtered = filtered.filter(contact => contact.email_status === emailStatusFilter);
      console.log(`[ContactsPage] Email status filter: ${beforeStatus} -> ${filtered.length} results`);
    }

    // Title filter
    if (titleFilter) {
      const beforeTitle = filtered.length;
      filtered = filtered.filter(contact =>
        contact.title.toLowerCase().includes(titleFilter.toLowerCase())
      );
      console.log(`[ContactsPage] Title filter: ${beforeTitle} -> ${filtered.length} results`);
    }

    // Business filter
    if (businessFilter) {
      const beforeBusiness = filtered.length;
      filtered = filtered.filter(contact =>
        contact.organization?.name && 
        contact.organization.name.toLowerCase().includes(businessFilter.toLowerCase())
      );
      console.log(`[ContactsPage] Business filter: ${beforeBusiness} -> ${filtered.length} results`);
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

    setFilteredContacts(filtered);
    setCurrentPage(1);
  };

  const handleSort = (field: keyof ApolloContact) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const exportToCSV = () => {
    const headers = [
      'Name', 'Title', 'Email', 'Email Status', 'Business Name', 'Business Address', 'LinkedIn URL', 'Created At'
    ];

    const csvData = filteredContacts.map(contact => [
      contact.name,
      contact.title,
      contact.email,
      contact.email_status,
      contact.organization?.name || '',
      contact.organization?.address || '',
      contact.linkedin_url || '',
      new Date(contact.createdAt).toLocaleDateString()
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apollo-contacts-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getUniqueTitles = () => {
    const titles = new Set<string>();
    contacts.forEach(contact => {
      if (contact.title) {
        titles.add(contact.title);
      }
    });
    return Array.from(titles).sort();
  };

  const getUniqueBusinesses = () => {
    const businesses = new Set<string>();
    contacts.forEach(contact => {
      if (contact.organization?.name) {
        businesses.add(contact.organization.name);
      }
    });
    return Array.from(businesses).sort();
  };

  const paginatedContacts = filteredContacts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredContacts.length / itemsPerPage);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="w-[90%] mx-auto">
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading contacts...</p>
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
              onClick={fetchContacts}
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
            <div className="text-sm text-gray-600">Total Contacts</div>
            <div className="text-2xl font-bold">{contacts.length}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">Filtered</div>
            <div className="text-2xl font-bold">{filteredContacts.length}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">Verified Emails</div>
            <div className="text-2xl font-bold">
              {contacts.filter(c => c.email_status === 'verified').length}
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600">With LinkedIn</div>
            <div className="text-2xl font-bold">
              {contacts.filter(c => c.linkedin_url).length}
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
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                  placeholder="Name, title, email, business..."
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Email Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Status
              </label>
              <select
                value={emailStatusFilter}
                onChange={(e) => setEmailStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Statuses</option>
                <option value="verified">Verified</option>
                <option value="unverified">Unverified</option>
              </select>
            </div>

            {/* Title Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title
              </label>
              <select
                value={titleFilter}
                onChange={(e) => setTitleFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Titles</option>
                {getUniqueTitles().map(title => (
                  <option key={title} value={title}>{title}</option>
                ))}
              </select>
            </div>

            {/* Business Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Business
              </label>
              <select
                value={businessFilter}
                onChange={(e) => setBusinessFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Businesses</option>
                {getUniqueBusinesses().map(business => (
                  <option key={business} value={business}>{business}</option>
                ))}
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('title')}>
                    <div className="flex items-center">
                      Title
                      {sortField === 'title' && (
                        sortDirection === 'asc' ? <SortAsc className="w-4 h-4 ml-1" /> : <SortDesc className="w-4 h-4 ml-1" />
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email Status</th>
                                     <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Business</th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">LinkedIn</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('createdAt')}>
                    <div className="flex items-center">
                      Added
                      {sortField === 'createdAt' && (
                        sortDirection === 'asc' ? <SortAsc className="w-4 h-4 ml-1" /> : <SortDesc className="w-4 h-4 ml-1" />
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paginatedContacts.map((contact) => (
                  <tr key={contact._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <User className="w-4 h-4 text-gray-400 mr-2" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">{contact.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{contact.title || '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Mail className="w-4 h-4 text-gray-400 mr-2" />
                        <span className="text-sm text-gray-900">{contact.email}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          contact.email_status === 'verified' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {contact.email_status}
                        </span>
                      </div>
                    </td>
                                         <td className="px-6 py-4 whitespace-nowrap">
                       <div className="flex items-center">
                         <Building className="w-4 h-4 text-gray-400 mr-2" />
                         <div>
                           <div className="text-sm font-medium text-gray-900">{contact.organization?.name || '-'}</div>
                           {contact.organization?.address && (
                             <div className="text-xs text-gray-500">{contact.organization.address}</div>
                           )}
                         </div>
                       </div>
                     </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {contact.linkedin_url ? (
                          <a
                            href={contact.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            <ExternalLink className="w-4 h-4 mr-1" />
                            Profile
                          </a>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {new Date(contact.createdAt).toLocaleDateString()}
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
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredContacts.length)} of {filteredContacts.length} results
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

export default ContactsPage; 