import React from 'react';
import { Search, Mail, Database, BarChart3, ChevronLeft, ChevronRight, User, DollarSign } from 'lucide-react';

interface SidebarProps {
  activeTab: 'search' | 'templates' | 'places' | 'contacts' | 'email-activity' | 'api-costs';
  onTabChange: (tab: 'search' | 'templates' | 'places' | 'contacts' | 'email-activity' | 'api-costs') => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, isCollapsed, onToggleCollapse }) => {
  const menuItems = [
    {
      id: 'search' as const,
      label: 'Search',
      icon: Search,
      description: 'Find local businesses'
    },
    {
      id: 'templates' as const,
      label: 'Email Templates',
      icon: Mail,
      description: 'Manage email templates'
    },
    {
      id: 'places' as const,
      label: 'Places DB',
      icon: Database,
      description: 'View saved businesses'
    },
    {
      id: 'contacts' as const,
      label: 'Contacts',
      icon: User,
      description: 'View Apollo contacts'
    },
    {
      id: 'email-activity' as const,
      label: 'Email Activity',
      icon: BarChart3,
      description: 'Track email campaigns'
    },
    {
      id: 'api-costs' as const,
      label: 'API Costs',
      icon: DollarSign,
      description: 'Track API usage costs'
    }
  ];

  return (
    <div className={`bg-white shadow-sm border-r border-gray-200 h-screen fixed left-0 top-0 z-10 transition-all duration-300 ${
      isCollapsed ? 'w-16' : 'w-64'
    }`}>
      <div className={`transition-all duration-300 ${isCollapsed ? 'px-3 py-6' : 'p-6'}`}>
        {/* Logo and Title */}
        <div className={`flex items-center space-x-3 mb-8 ${isCollapsed ? 'justify-center' : ''}`}>
          <img
            src="https://www.rayapp.io/wp-content/uploads/2024/12/logo-rayapp-azulwebp-300x150-1.webp"
            alt="RAY Logo"
            className={`object-contain ${isCollapsed ? 'h-6 w-auto' : 'h-8 w-auto'}`}
          />
          {!isCollapsed && (
            <div>
              <h1 className="text-lg font-bold text-gray-900">OutreachPro</h1>
              <p className="text-xs text-gray-600">Campaign Manager</p>
            </div>
          )}
        </div>

        {/* Toggle Button */}
        <button
          onClick={onToggleCollapse}
          className="absolute top-6 right-0 transform translate-x-1/2 bg-white border border-gray-200 rounded-full p-1 shadow-sm hover:shadow-md transition-shadow"
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4 text-gray-600" />
          ) : (
            <ChevronLeft className="h-4 w-4 text-gray-600" />
          )}
        </button>

        {/* Navigation Menu */}
        <nav className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center py-3 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                } ${
                  isCollapsed
                    ? 'justify-center'
                    : 'px-4 space-x-3 text-left'
                }`}
                title={isCollapsed ? item.label : undefined}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'text-blue-600' : 'text-gray-500'}`} />
                {!isCollapsed && (
                  <div className="flex-1">
                    <div className={`font-medium ${isActive ? 'text-blue-700' : 'text-gray-900'}`}>
                      {item.label}
                    </div>
                    <div className={`text-xs ${isActive ? 'text-blue-600' : 'text-gray-500'}`}>
                      {item.description}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

export default Sidebar; 