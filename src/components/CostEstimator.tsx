import React, { useState, useEffect } from 'react';
import { DollarSign, Info, TrendingUp, HelpCircle } from 'lucide-react';

interface CostEstimatorProps {
  estimatedResults: number;
  includeApollo: boolean;
  setEstimatedResults: (count: number) => void;
}

interface APICost {
  name: string;
  cost: number;
  description: string;
  color: string;
  tooltip: string;
}

const CostEstimator: React.FC<CostEstimatorProps> = ({ estimatedResults, includeApollo, setEstimatedResults }) => {
  // API pricing estimates (based on typical rates)
  const GOOGLE_PLACES_SEARCH_COST = 0.017; // per search request
  const GOOGLE_PLACES_DETAILS_COST = 0.017; // per details request
  const [apolloCostPerCredit, setApolloCostPerCredit] = useState(0.00895); // Default to your current rate ($198/22110 credits)
  
  // Fetch Apollo cost per credit from server
  useEffect(() => {
    const fetchApolloPricing = async () => {
      try {
        const response = await fetch('/api/apollo-pricing');
        if (response.ok) {
          const data = await response.json();
          setApolloCostPerCredit(data.costPerCredit);
        }
      } catch (error) {
        console.log('Using default Apollo pricing');
      }
    };
    
    fetchApolloPricing();
  }, []);
  
  const calculateCosts = (): APICost[] => {
    const costs: APICost[] = [];
    
    // Google Places Search
    const searchCost = GOOGLE_PLACES_SEARCH_COST;
    costs.push({
      name: 'Google Places Search',
      cost: searchCost,
      description: 'Text search request',
      color: 'bg-blue-50 text-blue-700',
      tooltip: `1 search request × $${GOOGLE_PLACES_SEARCH_COST.toFixed(3)} = $${searchCost.toFixed(2)}`
    });
    
    // Google Places Details (for each result)
    const detailsCost = estimatedResults * GOOGLE_PLACES_DETAILS_COST;
    costs.push({
      name: 'Google Places Details',
      cost: detailsCost,
      description: `${estimatedResults} detail requests`,
      color: 'bg-green-50 text-green-700',
      tooltip: `${estimatedResults} detail requests × $${GOOGLE_PLACES_DETAILS_COST.toFixed(3)} = $${detailsCost.toFixed(2)}`
    });
    
    // Apollo API (if enabled)
    if (includeApollo) {
      const apolloCost = estimatedResults * apolloCostPerCredit;
      costs.push({
        name: 'Apollo Contact Lookup',
        cost: apolloCost,
        description: `${estimatedResults} contact searches`,
        color: 'bg-purple-50 text-purple-700',
        tooltip: `${estimatedResults} contact searches × $${apolloCostPerCredit.toFixed(4)} = $${apolloCost.toFixed(2)}`
      });
    }
    
    return costs;
  };
  
  const costs = calculateCosts();
  const totalCost = costs.reduce((sum, cost) => sum + cost.cost, 0);
  
  const formatCost = (cost: number) => {
    return `$${cost.toFixed(2)}`;
  };
  
  return (
    <div className="bg-white p-4 rounded-lg border border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <DollarSign className="h-5 w-5 text-gray-600" />
          <h3 className="text-sm font-medium text-gray-900">Estimated API Costs</h3>
        </div>
        <div className="flex items-center space-x-1 text-xs text-gray-500">
          <Info className="h-3 w-3" />
          <span>Estimates</span>
        </div>
      </div>
      
      <div className="space-y-4">
        <div>
          <label htmlFor="estimated-results" className="block text-sm font-medium text-gray-700 mb-1">
            Estimated Results ({estimatedResults} businesses)
          </label>
          <input
            id="estimated-results"
            type="range"
            min="5"
            max="100"
            value={estimatedResults}
            onChange={(e) => setEstimatedResults(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>5</span>
            <span>50</span>
            <span>100</span>
          </div>
        </div>
        
        <div className="space-y-2">
          {costs.map((cost, index) => (
            <div key={index} className="flex items-center justify-between text-sm group relative">
              <div className="flex items-center space-x-2">
                <span className={`px-2 py-1 rounded text-xs font-medium ${cost.color}`}>
                  {cost.name}
                </span>
                <div className="relative">
                  <HelpCircle className="h-3 w-3 text-gray-400 cursor-help" />
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                    {cost.tooltip}
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-medium">{formatCost(cost.cost)}</div>
                <div className="text-xs text-gray-500">{cost.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="border-t border-gray-200 pt-3 mt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <TrendingUp className="h-4 w-4 text-gray-600" />
            <span className="text-sm font-medium text-gray-900">Total Estimated Cost</span>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-gray-900">{formatCost(totalCost)}</div>
            <div className="text-xs text-gray-500">
              for ~{estimatedResults} businesses
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
        <div className="flex items-start space-x-2">
          <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-medium mb-1">Cost Breakdown:</div>
            <ul className="space-y-1 text-xs">
              <li>•Google Places Search: $0.017 per request</li>
              <li>•Google Places Details: $0.017 per business</li>
              <li>•Apollo Contact Lookup: ${apolloCostPerCredit.toFixed(4)} per credit</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CostEstimator; 