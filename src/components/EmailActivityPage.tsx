import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  SortAsc, 
  SortDesc, 
  RefreshCw, 
  Mail, 
  Eye, 
  MousePointer, 
  AlertCircle, 
  CheckCircle, 
  Clock,
  BarChart3,
  Calendar,
  User,
  Building
} from 'lucide-react';

interface EmailActivity {
  _id: string;
  emailId: string;
  businessId: string;
  businessName: string;
  decisionMakerId: string;
  decisionMakerName: string;
  decisionMakerEmail: string;
  subject: string;
  templateId: string;
  templateName: string;
  status: 'sent' | 'delivered' | 'bounced' | 'failed' | 'opened' | 'clicked' | 'complained' | 'unsubscribed';
  sentAt: string;
  deliveredAt?: string;
  openedAt?: string;
  clickedAt?: string;
  bouncedAt?: string;
  failedAt?: string;
  openCount: number;
  clickCount: number;
  lastOpenedAt?: string;
  lastClickedAt?: string;
  emailType: 'test' | 'real';
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

interface EmailStats {
  overall: {
    total: number;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    failed: number;
    totalOpens: number;
    totalClicks: number;
  };
  byType: Array<{
    _id: string;
    count: number;
  }>;
}

interface EmailActivityPageProps {
  onBack?: () => void;
}

const EmailActivityPage: React.FC<EmailActivityPageProps> = ({ onBack }) => {
  const [activities, setActivities] = useState<EmailActivity[]>([]);
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [emailTypeFilter, setEmailTypeFilter] = useState('');
  const [businessFilter, setBusinessFilter] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  
  // Sorting
  const [sortField, setSortField] = useState('sentAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const fetchActivities = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
        ...(statusFilter && { status: statusFilter }),
        ...(emailTypeFilter && { emailType: emailTypeFilter }),
        ...(businessFilter && { businessId: businessFilter }),
        ...(searchTerm && { search: searchTerm })
      });

      const response = await fetch(`/api/email-activities?${params}`);
      if (!response.ok) throw new Error('Failed to fetch email activities');
      
      const data = await response.json();
      setActivities(data.activities);
      setTotalPages(data.pagination.pages);
      setTotalItems(data.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch email activities');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/email-activities/stats');
      if (!response.ok) throw new Error('Failed to fetch email stats');
      
      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch email stats:', err);
    }
  };

  useEffect(() => {
    fetchActivities();
    fetchStats();
  }, [currentPage, itemsPerPage, statusFilter, emailTypeFilter, businessFilter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchActivities(), fetchStats()]);
    setRefreshing(false);
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return <Clock className="w-4 h-4 text-blue-500" />;
      case 'delivered':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'opened':
        return <Eye className="w-4 h-4 text-purple-500" />;
      case 'clicked':
        return <MousePointer className="w-4 h-4 text-orange-500" />;
      case 'bounced':
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Mail className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent':
        return 'bg-blue-100 text-blue-800';
      case 'delivered':
        return 'bg-green-100 text-green-800';
      case 'opened':
        return 'bg-purple-100 text-purple-800';
      case 'clicked':
        return 'bg-orange-100 text-orange-800';
      case 'bounced':
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const exportToCSV = () => {
    const headers = [
      'Email ID',
      'Business',
      'Decision Maker',
      'Email',
      'Subject',
      'Template',
      'Status',
      'Sent At',
      'Opened At',
      'Clicked At',
      'Open Count',
      'Click Count',
      'Email Type'
    ];

    const csvData = activities.map(activity => [
      activity.emailId,
      activity.businessName,
      activity.decisionMakerName,
      activity.decisionMakerEmail,
      activity.subject,
      activity.templateName,
      activity.status,
      formatDate(activity.sentAt),
      activity.openedAt ? formatDate(activity.openedAt) : '',
      activity.clickedAt ? formatDate(activity.clickedAt) : '',
      activity.openCount,
      activity.clickCount,
      activity.emailType
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `email-activities-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading && !refreshing) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-4" />
              <p className="text-gray-500">Loading email activities...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-4" />
              <p className="text-red-500 mb-4">{error}</p>
              <button
                onClick={handleRefresh}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="w-[90%] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-end mb-6">
          <div className="flex items-center space-x-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center space-x-2 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={exportToCSV}
              className="flex items-center space-x-2 bg-blue-600 text-white rounded-lg px-3 py-2 text-sm font-medium hover:bg-blue-700"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center">
                <BarChart3 className="w-8 h-8 text-blue-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600">Total Emails</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.overall.total}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center">
                <Eye className="w-8 h-8 text-purple-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600">Total Opens</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.overall.totalOpens}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center">
                <MousePointer className="w-8 h-8 text-orange-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600">Total Clicks</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.overall.totalClicks}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center">
                <Calendar className="w-8 h-8 text-green-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-600">Open Rate</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {stats.overall.total > 0 ? Math.round((stats.overall.totalOpens / stats.overall.total) * 100) : 0}%
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">Filters</h3>
              <div className="flex items-center space-x-3">
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="border border-gray-300 rounded-md px-3 py-1 text-sm"
                >
                  <option value={10}>10 per page</option>
                  <option value={20}>20 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                </select>
              </div>
            </div>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search emails..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Statuses</option>
                  <option value="sent">Sent</option>
                  <option value="delivered">Delivered</option>
                  <option value="opened">Opened</option>
                  <option value="clicked">Clicked</option>
                  <option value="bounced">Bounced</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Type</label>
                <select
                  value={emailTypeFilter}
                  onChange={(e) => setEmailTypeFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Types</option>
                  <option value="test">Test</option>
                  <option value="real">Real</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business</label>
                <input
                  type="text"
                  placeholder="Filter by business..."
                  value={businessFilter}
                  onChange={(e) => setBusinessFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Email Activities Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Business
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Decision Maker
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Subject
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Template
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('sentAt')}>
                    <div className="flex items-center">
                      Sent At
                      {sortField === 'sentAt' && (
                        sortDirection === 'asc' ? <SortAsc className="w-4 h-4 ml-1" /> : <SortDesc className="w-4 h-4 ml-1" />
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Opens
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Clicks
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {activities.map((activity) => (
                  <tr key={activity._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {getStatusIcon(activity.status)}
                        <span className={`ml-2 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(activity.status)}`}>
                          {activity.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Building className="w-4 h-4 text-gray-400 mr-2" />
                        <span className="text-sm font-medium text-gray-900">{activity.businessName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <User className="w-4 h-4 text-gray-400 mr-2" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">{activity.decisionMakerName}</div>
                          <div className="text-sm text-gray-500">{activity.decisionMakerEmail}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 max-w-xs truncate" title={activity.subject}>
                        {activity.subject}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">{activity.templateName}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{formatDate(activity.sentAt)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {activity.openCount > 0 ? (
                          <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs">
                            {activity.openCount}
                          </span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {activity.clickCount > 0 ? (
                          <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs">
                            {activity.clickCount}
                          </span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        activity.emailType === 'test' 
                          ? 'bg-yellow-100 text-yellow-800' 
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {activity.emailType}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="bg-white px-4 py-3 border-t border-gray-200 sm:px-6">
              <div className="flex items-center justify-between">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-700">
                      Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
                      <span className="font-medium">
                        {Math.min(currentPage * itemsPerPage, totalItems)}
                      </span>{' '}
                      of <span className="font-medium">{totalItems}</span> results
                    </p>
                  </div>
                  <div>
                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                      <button
                        onClick={() => setCurrentPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Previous
                      </button>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const page = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                        return (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                              page === currentPage
                                ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                                : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                            }`}
                          >
                            {page}
                          </button>
                        );
                      })}
                      <button
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Next
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailActivityPage; 