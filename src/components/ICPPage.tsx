import React, { useState, useEffect, useMemo } from 'react';
import { Target, Save, RotateCcw, Play, RefreshCw, X, Settings, Info } from 'lucide-react';

interface ICPFactor {
  enabled: boolean;
  weight: number;
  minIdeal?: number;
  maxIdeal?: number;
}

interface ICPConfig {
  _id?: string;
  name: string;
  type: 'midmarket' | 'independent';
  factors: {
    numLocations: ICPFactor;
    poorSEO: ICPFactor;
    hasWhatsApp: ICPFactor;
    hasReservation: ICPFactor;
    hasDirectOrdering: ICPFactor;
    isArgentina: ICPFactor;
    noWebsite: ICPFactor;
  };
}

const ICPPage: React.FC = () => {
  const [configs, setConfigs] = useState<ICPConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<ICPConfig | null>(null);
  const [showCalculateModal, setShowCalculateModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [calculationResult, setCalculationResult] = useState<any>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showDeliveryCategoriesModal, setShowDeliveryCategoriesModal] = useState(false);
  const [showBookingCategoriesModal, setShowBookingCategoriesModal] = useState(false);
  const [showGeographyModal, setShowGeographyModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showResetResultModal, setShowResetResultModal] = useState(false);
  const [resetConfigs, setResetConfigs] = useState<any>(null);
  const [newCategory, setNewCategory] = useState('');
  const [newCountry, setNewCountry] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showCountrySuggestions, setShowCountrySuggestions] = useState(false);

  // Google Business Profile categories (Restaurant & Food related)
  const googleBusinessCategories = [
    'Restaurant',
    'Pizza Restaurant',
    'Italian Restaurant',
    'Mexican Restaurant',
    'Chinese Restaurant',
    'Japanese Restaurant',
    'Sushi Restaurant',
    'Thai Restaurant',
    'Indian Restaurant',
    'Mediterranean Restaurant',
    'American Restaurant',
    'Steakhouse',
    'Seafood Restaurant',
    'Vegetarian Restaurant',
    'Vegan Restaurant',
    'Fast Food Restaurant',
    'Hamburger Restaurant',
    'Sandwich Shop',
    'Coffee Shop',
    'Cafe',
    'Bakery',
    'Bar',
    'Pub',
    'Wine Bar',
    'Cocktail Bar',
    'Sports Bar',
    'Brewery',
    'Fine Dining Restaurant',
    'Bistro',
    'Brasserie',
    'Tapas Bar',
    'Ice Cream Shop',
    'Dessert Shop',
    'Pastry Shop',
    'Deli',
    'Brunch Restaurant',
    'Breakfast Restaurant',
    'Lunch Restaurant',
    'Dinner Restaurant',
    'Food Truck',
    'Caterer',
    'Meal Delivery',
    'Meal Takeaway'
  ].sort();

  const filteredSuggestions = useMemo(() => {
    if (!newCategory.trim()) return [];
    return googleBusinessCategories.filter(cat => 
      cat.toLowerCase().includes(newCategory.toLowerCase())
    ).slice(0, 8); // Show max 8 suggestions
  }, [newCategory]);

  useEffect(() => {
    fetchConfigs();
  }, []);

  // Initialize categories and countries from selected config
  useEffect(() => {
    if (selectedConfig) {
      if (selectedConfig.deliveryCategories && selectedConfig.deliveryCategories.length > 0) {
        setDeliveryCategories(selectedConfig.deliveryCategories);
      }
      if (selectedConfig.bookingCategories && selectedConfig.bookingCategories.length > 0) {
        setBookingCategories(selectedConfig.bookingCategories);
      }
      if (selectedConfig.targetCountries && selectedConfig.targetCountries.length > 0) {
        setTargetCountries(selectedConfig.targetCountries);
      }
    }
  }, [selectedConfig]);

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/icp-configs');
      const data = await response.json();
      setConfigs(data);
      if (data.length > 0 && !selectedConfig) {
        setSelectedConfig(data[0]);
      }
    } catch (error) {
      console.error('Failed to fetch ICP configs:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateTotalWeight = (config: ICPConfig) => {
    const total = Object.entries(config.factors).reduce((sum, [factorKey, f]: [string, any]) => {
      const weight = f.enabled ? Number(f.weight) : 0;
      return sum + weight;
    }, 0);
    return total;
  };

  const isValidWeight = (config: ICPConfig) => {
    const total = calculateTotalWeight(config);
    return total === 10;
  };

  const handleSave = async () => {
    if (!selectedConfig || !selectedConfig._id) return;

    const currentTotal = calculateTotalWeight(selectedConfig);
    console.log('Current total weight:', currentTotal);
    console.log('Is valid:', isValidWeight(selectedConfig));

    // Validate total weight
    if (!isValidWeight(selectedConfig)) {
      alert(`Cannot save: Total weight must equal 10. Current total: ${currentTotal}`);
      return;
    }

    try {
      setSaving(true);
      
      // Include categories and countries in the save payload
      const configToSave = {
        ...selectedConfig,
        deliveryCategories,
        bookingCategories,
        targetCountries
      };
      
      const response = await fetch(`/api/icp-configs/${selectedConfig._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configToSave)
      });
      
      if (response.ok) {
        setShowSuccessModal(true);
        fetchConfigs();
      } else {
        const errorData = await response.json();
        alert('Failed to save configuration: ' + (errorData.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      alert('Failed to save configuration: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setShowResetModal(false);
    
    try {
      const response = await fetch('/api/icp-configs/reset', {
        method: 'POST'
      });
      
      if (response.ok) {
        const data = await response.json();
        setResetConfigs(data.configs);
        setShowResetResultModal(true);
        fetchConfigs();
      } else {
        alert('Failed to reset configurations');
      }
    } catch (error) {
      console.error('Failed to reset configs:', error);
      alert('Failed to reset configurations');
    }
  };

  const handleCalculateScores = async () => {
    setShowCalculateModal(false);
    
    try {
      setCalculating(true);
      const response = await fetch('/api/icp-score/bulk-calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ icpType: 'both' })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        setCalculationResult(result);
      }
    } catch (error) {
      console.error('Failed to calculate scores:', error);
      alert('Failed to calculate ICP scores');
    } finally {
      setCalculating(false);
    }
  };

  const updateFactor = (factorName: string, field: string, value: any) => {
    if (!selectedConfig) return;

    setSelectedConfig({
      ...selectedConfig,
      factors: {
        ...selectedConfig.factors,
        [factorName]: {
          ...selectedConfig.factors[factorName as keyof typeof selectedConfig.factors],
          [field]: value
        }
      }
    });
  };

  const factorLabels: Record<string, string> = {
    numLocations: 'Number of Locations',
    poorSEO: 'Good SEO/AEO Practices',
    hasWhatsApp: 'Has WhatsApp Number',
    hasReservation: 'Has Reservation CTA',
    hasDirectOrdering: 'Has Direct Ordering',
    isArgentina: 'Geography',
    noWebsite: 'No Website (Independent only)',
    deliveryIntensiveCategory: 'Delivery Intensive Category',
    bookingIntensiveCategory: 'Booking Intensive Category'
  };

  const factorDescriptions: Record<string, string> = {
    numLocations: 'Ideal range of physical locations',
    poorSEO: 'Website follows SEO best practices (title, meta, H1, structured data)',
    hasWhatsApp: 'WhatsApp number exposed on website',
    hasReservation: 'Has "Reservar" call to action',
    hasDirectOrdering: 'Has direct ordering without PedidosYa/Rappi',
    isArgentina: 'Business is located in selected countries',
    noWebsite: 'Business has no website (scoring factor for independent restaurants)',
    deliveryIntensiveCategory: 'Business category is delivery-intensive',
    bookingIntensiveCategory: 'Business uses bookings intensively'
  };

  // Default categories
  const [deliveryCategories, setDeliveryCategories] = useState<string[]>([
    'Pizza',
    'Hamburguesas',
    'Sushi',
    'Comida Mexicana',
    'Comida Healthy',
    'Milanesas',
    'Empanadas'
  ]);

  const [bookingCategories, setBookingCategories] = useState<string[]>([
    'Bar',
    'Craft Beer',
    'Fine Dining'
  ]);

  const [targetCountries, setTargetCountries] = useState<string[]>([
    'Argentina'
  ]);

  // List of countries for autocomplete
  const worldCountries = [
    'Argentina', 'Brazil', 'Chile', 'Colombia', 'Mexico', 'Peru', 'Uruguay',
    'United States', 'Canada', 'Spain', 'France', 'Italy', 'Germany', 'United Kingdom',
    'Australia', 'New Zealand', 'Japan', 'China', 'India', 'South Korea'
  ].sort();

  const filteredCountries = useMemo(() => {
    if (!newCountry.trim()) return [];
    return worldCountries.filter(country => 
      country.toLowerCase().includes(newCountry.toLowerCase())
    ).slice(0, 8);
  }, [newCountry]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading ICP configurations...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header with Profile Selector and Actions */}
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <div className="flex items-center justify-between">
            {/* Profile Selector Buttons */}
            <div className="flex space-x-4">
              {configs.map((config) => (
                <button
                  key={config._id}
                  onClick={() => setSelectedConfig(config)}
                  className={`py-3 px-6 rounded-lg font-medium transition-all border-2 ${
                    selectedConfig?._id === config._id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-lg'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:shadow-md'
                  }`}
                >
                  <div className="text-base font-semibold">{config.name}</div>
                  <div className={`text-sm mt-1 ${
                    selectedConfig?._id === config._id ? 'text-blue-100' : 'text-gray-500'
                  }`}>
                    {config.type === 'midmarket' ? '10+ Locations' : '2-9 Locations'}
                  </div>
                </button>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                onClick={() => setShowCalculateModal(true)}
                disabled={calculating}
                className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {calculating ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Calculating...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Calculate All Scores
                  </>
                )}
              </button>
              <button
                onClick={() => setShowResetModal(true)}
                className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset to Defaults
              </button>
            </div>
          </div>
        </div>

        {/* Configuration Form */}
        {selectedConfig && (
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-gray-900">
                    {selectedConfig.name} Configuration
                  </h2>
                  <button
                    onClick={() => setShowInfoModal(true)}
                    className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                    title="How ICP Scoring Works"
                  >
                    <Info className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  Total Weight: <span className={`font-semibold ${
                    isValidWeight(selectedConfig)
                      ? 'text-green-600' 
                      : 'text-red-600'
                  }`}>
                    {Math.round(calculateTotalWeight(selectedConfig))} / 10
                  </span>
                  {!isValidWeight(selectedConfig) && (
                    <span className="ml-2 text-red-600 text-xs">
                      ⚠ Must equal 10 to save
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={handleSave}
                disabled={saving || !isValidWeight(selectedConfig)}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.entries(selectedConfig.factors).map(([factorKey, factor]) => {
                // Skip noWebsite for midmarket
                if (factorKey === 'noWebsite' && selectedConfig.type === 'midmarket') {
                  return null;
                }
                
                // Skip poorSEO for independent
                if (factorKey === 'poorSEO' && selectedConfig.type === 'independent') {
                  return null;
                }

                return (
                  <div key={factorKey} className="border border-gray-200 rounded-lg p-4 flex flex-col">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            checked={factor.enabled}
                            onChange={(e) => updateFactor(factorKey, 'enabled', e.target.checked)}
                            className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <label className="ml-3 text-lg font-medium text-gray-900">
                            {factorLabels[factorKey]}
                          </label>
                          {/* Manage Categories icon for category factors */}
                          {(factorKey === 'deliveryIntensiveCategory' || factorKey === 'bookingIntensiveCategory') && (
                            <button
                              onClick={() => factorKey === 'deliveryIntensiveCategory' 
                                ? setShowDeliveryCategoriesModal(true) 
                                : setShowBookingCategoriesModal(true)
                              }
                              className="ml-2 p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Manage Categories"
                            >
                              <Settings className="w-5 h-5" />
                            </button>
                          )}
                          {/* Manage Countries icon for geography */}
                          {factorKey === 'isArgentina' && (
                            <button
                              onClick={() => setShowGeographyModal(true)}
                              className="ml-2 p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Manage Countries"
                            >
                              <Settings className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {factor.enabled && (
                      <div className="space-y-4">
                        <div className="flex gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Weight (0-10)
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="10"
                              step="1"
                              value={Math.round(factor.weight)}
                              onChange={(e) => {
                                const value = parseInt(e.target.value);
                                if (!isNaN(value) && value >= 0 && value <= 10) {
                                  updateFactor(factorKey, 'weight', value);
                                }
                              }}
                              className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center"
                            />
                          </div>

                          {factorKey === 'numLocations' && (
                            <>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Minimum Ideal
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  value={factor.minIdeal || ''}
                                  onChange={(e) => updateFactor(factorKey, 'minIdeal', parseInt(e.target.value))}
                                  className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center"
                                />
                              </div>
                              {selectedConfig.type === 'independent' && (
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Maximum Ideal
                                  </label>
                                  <input
                                    type="number"
                                    min="1"
                                    value={factor.maxIdeal || ''}
                                    onChange={(e) => updateFactor(factorKey, 'maxIdeal', parseInt(e.target.value))}
                                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center"
                                  />
                                </div>
                              )}
                            </>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          0 = No impact, 10 = Maximum impact
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}


        {/* Calculate Scores Confirmation Modal */}
        {showCalculateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Calculate ICP Scores
                </h2>
                <p className="text-gray-600 mb-6">
                  This will calculate ICP scores for all businesses in the database. Continue?
                </p>
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setShowCalculateModal(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCalculateScores}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reset Configuration Confirmation Modal */}
        {showResetModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Reset to Defaults
                </h2>
                <p className="text-gray-600 mb-6">
                  Are you sure you want to reset all ICP configurations to defaults?
                </p>
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setShowResetModal(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReset}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Calculation Result Modal */}
        {calculationResult && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">
                    ICP Scores Calculated
                  </h2>
                  <button
                    onClick={() => setCalculationResult(null)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-gray-200">
                    <span className="text-gray-600">Total Businesses:</span>
                    <span className="font-semibold text-gray-900">{calculationResult.total}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-200">
                    <span className="text-gray-600">Successfully Processed:</span>
                    <span className="font-semibold text-green-600">{calculationResult.processed}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-gray-600">Errors:</span>
                    <span className="font-semibold text-red-600">{calculationResult.errors}</span>
                  </div>
                </div>
                <div className="mt-6">
                  <button
                    onClick={() => setCalculationResult(null)}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Success Modal */}
        {showSuccessModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Configuration Saved Successfully!
                </h2>
                <div className="flex justify-end">
                  <button
                    onClick={() => setShowSuccessModal(false)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delivery Categories Modal */}
        {showDeliveryCategoriesModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">
                    Manage Delivery-Intensive Categories
                  </h2>
                  <button
                    onClick={() => {
                      setShowDeliveryCategoriesModal(false);
                      setNewCategory('');
                    }}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="mb-6">
                  <p className="text-sm text-gray-600 mb-4">
                    Categories that contribute full weight to the delivery score
                  </p>
                  
                  {/* Add new category */}
                  <div className="flex gap-2 mb-4 relative">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={newCategory}
                        onChange={(e) => {
                          setNewCategory(e.target.value);
                          setShowSuggestions(true);
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                        placeholder="Add new category..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter' && newCategory.trim()) {
                            setDeliveryCategories([...deliveryCategories, newCategory.trim()]);
                            setNewCategory('');
                            setShowSuggestions(false);
                          }
                        }}
                      />
                      
                      {/* Autocomplete suggestions */}
                      {showSuggestions && filteredSuggestions.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {filteredSuggestions.map((suggestion, index) => (
                            <button
                              key={index}
                              onClick={() => {
                                setNewCategory(suggestion);
                                setShowSuggestions(false);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors text-sm"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        if (newCategory.trim()) {
                          setDeliveryCategories([...deliveryCategories, newCategory.trim()]);
                          setNewCategory('');
                          setShowSuggestions(false);
                        }
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Add
                    </button>
                  </div>

                  {/* Category list */}
                  <div className="space-y-2">
                    {deliveryCategories.map((category, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-gray-900">{category}</span>
                        <button
                          onClick={() => setDeliveryCategories(deliveryCategories.filter((_, i) => i !== index))}
                          className="text-red-600 hover:text-red-800 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setShowDeliveryCategoriesModal(false);
                      setNewCategory('');
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Booking Categories Modal */}
        {showBookingCategoriesModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">
                    Manage Booking-Intensive Categories
                  </h2>
                  <button
                    onClick={() => {
                      setShowBookingCategoriesModal(false);
                      setNewCategory('');
                    }}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="mb-6">
                  <p className="text-sm text-gray-600 mb-4">
                    Categories that contribute full weight to the booking score
                  </p>
                  
                  {/* Add new category */}
                  <div className="flex gap-2 mb-4 relative">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={newCategory}
                        onChange={(e) => {
                          setNewCategory(e.target.value);
                          setShowSuggestions(true);
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                        placeholder="Add new category..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter' && newCategory.trim()) {
                            setBookingCategories([...bookingCategories, newCategory.trim()]);
                            setNewCategory('');
                            setShowSuggestions(false);
                          }
                        }}
                      />
                      
                      {/* Autocomplete suggestions */}
                      {showSuggestions && filteredSuggestions.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {filteredSuggestions.map((suggestion, index) => (
                            <button
                              key={index}
                              onClick={() => {
                                setNewCategory(suggestion);
                                setShowSuggestions(false);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors text-sm"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        if (newCategory.trim()) {
                          setBookingCategories([...bookingCategories, newCategory.trim()]);
                          setNewCategory('');
                          setShowSuggestions(false);
                        }
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Add
                    </button>
                  </div>

                  {/* Category list */}
                  <div className="space-y-2">
                    {bookingCategories.map((category, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-gray-900">{category}</span>
                        <button
                          onClick={() => setBookingCategories(bookingCategories.filter((_, i) => i !== index))}
                          className="text-red-600 hover:text-red-800 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setShowBookingCategoriesModal(false);
                      setNewCategory('');
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Info Modal */}
        {showInfoModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">
                    How ICP Scoring Works
                  </h2>
                  <button
                    onClick={() => setShowInfoModal(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <ul className="text-sm text-blue-900 space-y-2">
                      <li className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>Each lead receives a score from 0 to 10 based on configured factors</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>Total weight of all enabled factors should add up to 10</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>Each factor contributes to the final score based on its weight</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>Enable/disable factors to customize what matters for your ICPs</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>Adjust weights to prioritize certain factors over others</span>
                      </li>
                      <li className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>Use "Calculate All Scores" to recalculate existing businesses</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="flex justify-end mt-6">
                  <button
                    onClick={() => setShowInfoModal(false)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Got it
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reset Result Modal */}
        {showResetResultModal && resetConfigs && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">
                    Configurations Reset Successfully!
                  </h2>
                  <button
                    onClick={() => {
                      setShowResetResultModal(false);
                      setResetConfigs(null);
                    }}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <p className="text-gray-600 mb-6">
                  All ICP configurations have been reset to their default values.
                </p>

                <div className="space-y-6">
                  {resetConfigs.map((config: any, idx: number) => {
                    const isMidMarket = config.type === 'midmarket';
                    const totalWeight = Object.values(config.factors).reduce((sum: number, f: any) => 
                      f.enabled ? sum + Number(f.weight) : sum, 0
                    );

                    return (
                      <div key={idx} className={isMidMarket 
                        ? 'bg-blue-50 border border-blue-200 rounded-lg p-4' 
                        : 'bg-green-50 border border-green-200 rounded-lg p-4'
                      }>
                        <h3 className={isMidMarket 
                          ? 'text-lg font-semibold text-blue-900 mb-3' 
                          : 'text-lg font-semibold text-green-900 mb-3'
                        }>
                          {config.name}
                        </h3>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          {Object.entries(config.factors).map(([factorKey, factor]: [string, any]) => {
                            if (!factor.enabled) return null;
                            
                            const label = factorLabels[factorKey] || factorKey;
                            let weightText = `Weight: ${factor.weight}`;
                            
                            if (factorKey === 'numLocations') {
                              if (factor.minIdeal) {
                                weightText += ` (Min: ${factor.minIdeal}${factor.maxIdeal ? `, Max: ${factor.maxIdeal}` : ''})`;
                              }
                            }
                            
                            return (
                              <div key={factorKey} className="flex justify-between">
                                <span className={isMidMarket ? 'text-blue-800' : 'text-green-800'}>
                                  {label}:
                                </span>
                                <span className={isMidMarket ? 'font-medium text-blue-900' : 'font-medium text-green-900'}>
                                  {weightText}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <div className={isMidMarket 
                          ? 'mt-3 pt-3 border-t border-blue-300' 
                          : 'mt-3 pt-3 border-t border-green-300'
                        }>
                          <div className="flex justify-between font-semibold">
                            <span className={isMidMarket ? 'text-blue-900' : 'text-green-900'}>
                              Total Weight:
                            </span>
                            <span className={totalWeight === 10 ? 'text-green-600' : 'text-red-600'}>
                              {totalWeight} / 10
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end mt-6">
                  <button
                    onClick={() => {
                      setShowResetResultModal(false);
                      setResetConfigs(null);
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Geography Modal */}
        {showGeographyModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">
                    Manage Target Countries
                  </h2>
                  <button
                    onClick={() => {
                      setShowGeographyModal(false);
                      setNewCountry('');
                    }}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="mb-6">
                  <p className="text-sm text-gray-600 mb-4">
                    Countries that contribute to the geography score
                  </p>
                  
                  {/* Add new country */}
                  <div className="flex gap-2 mb-4 relative">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={newCountry}
                        onChange={(e) => {
                          setNewCountry(e.target.value);
                          setShowCountrySuggestions(true);
                        }}
                        onFocus={() => setShowCountrySuggestions(true)}
                        onBlur={() => setTimeout(() => setShowCountrySuggestions(false), 200)}
                        placeholder="Add new country..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter' && newCountry.trim()) {
                            setTargetCountries([...targetCountries, newCountry.trim()]);
                            setNewCountry('');
                            setShowCountrySuggestions(false);
                          }
                        }}
                      />
                      
                      {/* Autocomplete suggestions */}
                      {showCountrySuggestions && filteredCountries.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {filteredCountries.map((country, index) => (
                            <button
                              key={index}
                              onClick={() => {
                                setNewCountry(country);
                                setShowCountrySuggestions(false);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors text-sm"
                            >
                              {country}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        if (newCountry.trim()) {
                          setTargetCountries([...targetCountries, newCountry.trim()]);
                          setNewCountry('');
                          setShowCountrySuggestions(false);
                        }
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Add
                    </button>
                  </div>

                  {/* Country list */}
                  <div className="space-y-2">
                    {targetCountries.map((country, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-gray-900">{country}</span>
                        <button
                          onClick={() => setTargetCountries(targetCountries.filter((_, i) => i !== index))}
                          className="text-red-600 hover:text-red-800 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setShowGeographyModal(false);
                      setNewCountry('');
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ICPPage;

