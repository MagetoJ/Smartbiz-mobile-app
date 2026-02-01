import { useState } from 'react';
import { Settings as SettingsIcon, Building2, GitBranch, CreditCard, Users as UsersIcon, Printer } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import BusinessProfile from './BusinessProfile';
import BranchesSettings from './BranchesSettings';
import Subscription from './Subscription';
import Users from './Users';
import PrinterSettings from './PrinterSettings';

export default function Settings() {
  const { user } = useAuth();
  const showBranchesTab = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState<'profile' | 'branches' | 'subscription' | 'users' | 'printer'>(
    user?.role === 'admin' ? 'profile' : 'printer'
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <SettingsIcon className="h-6 w-6 text-gray-700" />
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Manage system configuration and reference data
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex flex-wrap gap-x-4 sm:gap-x-8 gap-y-2" aria-label="Tabs">
          {showBranchesTab && (
            <button
              onClick={() => setActiveTab('profile')}
              className={`
                flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${activeTab === 'profile'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <Building2 className="h-4 w-4" />
              Business Profile
            </button>
          )}
          {showBranchesTab && (
            <button
              onClick={() => setActiveTab('branches')}
              className={`
                flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${activeTab === 'branches'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <GitBranch className="h-4 w-4" />
              Branches
            </button>
          )}
          {showBranchesTab && (
            <button
              onClick={() => setActiveTab('users')}
              className={`
                flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${activeTab === 'users'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <UsersIcon className="h-4 w-4" />
              Users
            </button>
          )}
          {showBranchesTab && (
            <button
              onClick={() => setActiveTab('subscription')}
              className={`
                flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${activeTab === 'subscription'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              <CreditCard className="h-4 w-4" />
              Subscription
            </button>
          )}
          <button
            onClick={() => setActiveTab('printer')}
            className={`
              flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors
              ${activeTab === 'printer'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }
            `}
          >
            <Printer className="h-4 w-4" />
            Receipt Printer
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'profile' && showBranchesTab && <BusinessProfile />}
        {activeTab === 'branches' && showBranchesTab && <BranchesSettings />}
        {activeTab === 'users' && showBranchesTab && <Users />}
        {activeTab === 'subscription' && showBranchesTab && <Subscription />}
        {activeTab === 'printer' && <PrinterSettings />}
      </div>
    </div>
  );
}
