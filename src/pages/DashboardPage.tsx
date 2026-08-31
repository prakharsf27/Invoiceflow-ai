import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import { MetricCard } from '../components/dashboard/MetricCard';
import { AIFinanceBrief } from '../components/dashboard/AIFinanceBrief';
import { AttentionRequiredSection } from '../components/dashboard/AttentionRequiredSection';
import { AutomationFunnel } from '../components/dashboard/AutomationFunnel';
import { RecentActivityList } from '../components/dashboard/RecentActivityList';
import { Button } from '../components/ui/Button';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    totalPayables,
    invoicesReceived,
    needAttentionCount,
    overdueAmount,
    timeSavedHours,
    refreshData,
  } = useApp();

  // Re-fetch canonical state on mount
  React.useEffect(() => {
    refreshData();
  }, [refreshData]);

  const formatCurrencyDisplay = (amt: number) => {
    if (!amt || amt === 0) return '₹0';
    if (amt >= 100000) return `₹${(amt / 100000).toFixed(1)}L`;
    return `₹${amt.toLocaleString('en-IN')}`;
  };

  const firstName = user?.name ? user.name.split(' ')[0] : 'there';

  return (
    <div className="space-y-6">
      {/* Top Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            Good day, {firstName} 👋
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Here's what needs your attention today in {user?.companyName || 'your organization'}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => navigate('/app/upload')}
            variant="primary"
            size="sm"
            className="sm:hidden"
          >
            <Plus className="w-4 h-4" />
            <span>Upload Invoice</span>
          </Button>
          <Button
            onClick={refreshData}
            variant="ghost"
            size="icon"
            className="text-slate-400 hover:text-slate-700 cursor-pointer"
            title="Refresh dashboard data"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <MetricCard
          title="Total Payables"
          value={formatCurrencyDisplay(totalPayables)}
          subtext={totalPayables === 0 ? "Zero outstanding payables" : "Outstanding payables"}
          icon="wallet"
          onClick={() => navigate('/app/payments')}
        />

        <MetricCard
          title="Invoices Received"
          value={invoicesReceived.toString()}
          subtext={invoicesReceived === 0 ? "No invoices ingested" : `${invoicesReceived} active documents`}
          icon="invoices"
          onClick={() => navigate('/app/invoices')}
        />

        <MetricCard
          title="Need Attention"
          value={needAttentionCount.toString()}
          subtext={needAttentionCount === 0 ? "Zero pending flags" : "Requires AP review"}
          icon="attention"
          variant="attention"
          onClick={() => navigate('/app/exceptions')}
        />

        <MetricCard
          title="Overdue"
          value={formatCurrencyDisplay(overdueAmount)}
          subtext={overdueAmount === 0 ? "Zero overdue bills" : "Outstanding overdue"}
          icon="overdue"
          variant="overdue"
          onClick={() => navigate('/app/invoices?filter=overdue')}
        />

        <MetricCard
          title="Time Saved"
          value={`${timeSavedHours} hrs`}
          subtext={timeSavedHours === 0 ? "0 hrs automated" : "Autonomous AP savings"}
          icon="time"
          variant="time"
          onClick={() => navigate('/app/reports')}
        />
      </div>

      {/* Prominent AI Finance Brief */}
      <AIFinanceBrief />

      {/* Attention Required Cards */}
      <AttentionRequiredSection />

      {/* Automation Funnel & Time Saved */}
      <AutomationFunnel />

      {/* Recent Activity Stream */}
      <RecentActivityList />
    </div>
  );
};
