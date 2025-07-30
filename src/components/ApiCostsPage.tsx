import React, { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, TrendingDown, RefreshCw, AlertCircle, CheckCircle, Clock, BarChart2 } from 'lucide-react';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar } from 'recharts';
import { ApiCallLog } from '../types';
import ApiCallLogTable from './ApiCallLogTable';

interface MonthlyCost {
  month: string;
  totalCost: number;
  googleCost: number;
  apolloCost: number;
  usage: {
    googlePlacesSearch: number;
    googlePlacesDetails: number;
    apolloContacts: number;
  };
}

interface ApiCostsData {
  total: {
    currentMonth: number;
    previousMonth: number;
    trend: 'up' | 'down' | 'stable';
  };
  history: MonthlyCost[];
}

const ApiCostsPage: React.FC = () => {
  const [costsData, setCostsData] = useState<ApiCostsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [logs, setLogs] = useState<{ google: ApiCallLog[], apollo: ApiCallLog[] }>({ google: [], apollo: [] });

  const fetchCostsData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('http://localhost:3001/api/costs');
      if (!response.ok) {
        throw new Error('Failed to fetch costs data');
      }
      
      const data = await response.json();
      setCostsData(data);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch costs data');
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/costs/history');
      const data = await response.json();
      setLogs({
        google: [...data.googlePlacesSearch, ...data.googlePlacesDetails],
        apollo: data.apolloContacts,
      });
    } catch (error) {
      console.error('Failed to fetch API logs:', error);
    }
  };

  useEffect(() => {
    fetchCostsData();
    fetchLogs();
    
    // Refresh data every 5 minutes
    const interval = setInterval(() => {
      fetchCostsData();
      fetchLogs();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-red-500" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-green-500" />;
      default:
        return <div className="h-4 w-4" />;
    }
  };

  const getStatusColor = (amount: number) => {
    if (amount > 100) return 'text-red-600';
    if (amount > 50) return 'text-yellow-600';
    return 'text-green-600';
  };

  if (loading && !costsData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 text-gray-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading API costs...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-4" />
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={fetchCostsData}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-end">
        <div className="flex items-center space-x-4">
          {lastRefresh && (
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <Clock className="h-4 w-4" />
              <span>Last updated: {lastRefresh.toLocaleTimeString()}</span>
            </div>
          )}
          <button
            onClick={fetchCostsData}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Monthly Cost History Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Monthly Cost History</h2>
          <BarChart2 className="h-5 w-5 text-gray-400" />
        </div>
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <BarChart
              data={costsData?.history}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(value) => formatCurrency(value as number)} />
              <Tooltip formatter={(value) => formatCurrency(value as number)} />
              <Legend />
              <Bar dataKey="googleCost" stackId="a" fill="#4285F4" name="Google" />
              <Bar dataKey="apolloCost" stackId="a" fill="#7c3aed" name="Apollo" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* API Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Google Places Column */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Google Places API</h3>
              <CheckCircle className="h-5 w-5 text-green-500" />
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Current Month:</span>
                <span className={`font-semibold ${costsData ? getStatusColor(costsData.total.currentMonth) : 'text-gray-900'}`}>
                  {costsData ? formatCurrency(costsData.total.currentMonth) : '$0.00'}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Previous Month:</span>
                <span className="font-semibold text-gray-900">
                  {costsData ? formatCurrency(costsData.total.previousMonth) : '$0.00'}
                </span>
              </div>
              
              <div className="border-t border-gray-200 pt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Usage This Month</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Search Requests:</span>
                    <span className="font-medium">{costsData?.history.at(-1)?.usage.googlePlacesSearch ?? '0'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Details Requests:</span>
                    <span className="font-medium">{costsData?.history.at(-1)?.usage.googlePlacesDetails ?? '0'}</span>
                  </div>
                </div>
              </div>
              
            </div>
          </div>
          <ApiCallLogTable title="Google Places API Calls" logs={logs.google} />
        </div>

        {/* Apollo API Column */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Apollo API</h3>
              <CheckCircle className="h-5 w-5 text-green-500" />
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Current Month:</span>
                <span className={`font-semibold ${costsData ? getStatusColor(costsData.total.currentMonth) : 'text-gray-900'}`}>
                  {costsData ? formatCurrency(costsData.total.currentMonth) : '$0.00'}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Previous Month:</span>
                <span className="font-semibold text-gray-900">
                  {costsData ? formatCurrency(costsData.total.previousMonth) : '$0.00'}
                </span>
              </div>
              
              <div className="border-t border-gray-200 pt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Usage This Month</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Contact Searches:</span>
                    <span className="font-medium">{costsData?.history.at(-1)?.usage.apolloContacts ?? '0'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Remaining Credits:</span>
                    <span className="font-medium">0</span>
                  </div>
                </div>
              </div>
              
            </div>
          </div>
          <ApiCallLogTable title="Apollo API Calls" logs={logs.apollo} />
        </div>
      </div>
    </div>
  );
};

export default ApiCostsPage; 