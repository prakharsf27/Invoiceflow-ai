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

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    totalPayables,
    invoicesReceived,
    needAttentionCount,
    overdueAmount,
    timeSavedHours,
    refreshData,
  } = useApp();

  const formatLakhs = (amt: number) => `₹${(amt / 100000).toFixed(1)}L`;

  return (
    <div className="space-y-6">
      {/* Top Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            Good morning, Prakhar 👋
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Here's what needs your attention today.
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
          value={formatLakhs(totalPayables)}
          subtext="vs last week"
          trend={{ value: "+2.1%", isPositive: true }}
          icon="wallet"
          onClick={() => navigate('/app/payments')}
        />

        <MetricCard
          title="Invoices Received"
          value={invoicesReceived.toString()}
          subtext="This week"
          icon="invoices"
          onClick={() => navigate('/app/invoices')}
        />

        <MetricCard
          title="Need Attention"
          value={needAttentionCount.toString()}
          subtext="Requires review"
          icon="attention"
          variant="attention"
          onClick={() => navigate('/app/exceptions')}
        />

        <MetricCard
          title="Overdue"
          value={formatLakhs(overdueAmount)}
          subtext="Across overdue bills"
          icon="overdue"
          variant="overdue"
          onClick={() => navigate('/app/invoices?filter=overdue')}
        />

        <MetricCard
          title="Time Saved"
          value={`${timeSavedHours} hrs`}
          subtext="saved this week"
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
