import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileQuestion, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/Button';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-4">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center">
          <FileQuestion className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Page Not Found</h1>
        <p className="text-xs text-slate-500">
          The requested page could not be found. Please check the URL or return to the dashboard.
        </p>
        <div>
          <Button onClick={() => navigate('/app')} variant="primary" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" /> Return to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};
