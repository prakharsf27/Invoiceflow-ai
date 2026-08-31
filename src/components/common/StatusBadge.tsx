import React from 'react';
import { Badge } from '../ui/Badge';
import { InvoiceStatus, PaymentStatus, RiskLevel } from '../../types';

interface StatusBadgeProps {
  type: 'invoice' | 'payment' | 'risk' | 'ai';
  value: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ type, value }) => {
  if (type === 'invoice') {
    const val = value.toLowerCase() as InvoiceStatus;
    switch (val) {
      case 'ready':
        return <Badge variant="success" dot>Ready</Badge>;
      case 'approved':
        return <Badge variant="success" dot>Approved</Badge>;
      case 'review':
        return <Badge variant="warning" dot>Needs Review</Badge>;
      case 'critical':
        return <Badge variant="danger" dot>Critical</Badge>;
      case 'overdue':
        return <Badge variant="danger" dot>Overdue</Badge>;
      case 'paid':
        return <Badge variant="success" dot>Paid</Badge>;
      case 'hold':
      case 'on_hold':
        return <Badge variant="neutral" dot>On Hold</Badge>;
      case 'processing':
        return <Badge variant="purple" dot>Processing</Badge>;
      default:
        return <Badge variant="neutral">{value}</Badge>;
    }
  }

  if (type === 'ai') {
    switch (value) {
      case 'Approved':
        return <Badge variant="success">✓ Approved</Badge>;
      case 'Ready':
        return <Badge variant="success">✓ Ready</Badge>;
      case 'PO Mismatch':
        return <Badge variant="danger">⚠ PO Mismatch</Badge>;
      case 'Possible Duplicate':
        return <Badge variant="warning">⚠ Duplicate Check</Badge>;
      case 'Bank Detail Change':
        return <Badge variant="danger">⚠ Bank Changed</Badge>;
      case 'Missing Information':
        return <Badge variant="warning">Missing Info</Badge>;
      case 'Overdue':
        return <Badge variant="danger">Overdue</Badge>;
      default:
        return <Badge variant="purple">{value}</Badge>;
    }
  }

  if (type === 'payment') {
    const val = value.toLowerCase() as PaymentStatus;
    switch (val) {
      case 'paid':
        return <Badge variant="success">Paid</Badge>;
      case 'scheduled':
        return <Badge variant="info">Scheduled</Badge>;
      case 'pending':
        return <Badge variant="neutral">Pending</Badge>;
      case 'overdue':
        return <Badge variant="danger">Overdue</Badge>;
      case 'on_hold':
        return <Badge variant="warning">On Hold</Badge>;
      default:
        return <Badge variant="neutral">{value}</Badge>;
    }
  }

  if (type === 'risk') {
    const val = value.toLowerCase() as RiskLevel;
    switch (val) {
      case 'low':
        return <Badge variant="success">Low Risk</Badge>;
      case 'medium':
        return <Badge variant="warning">Medium Risk</Badge>;
      case 'high':
        return <Badge variant="danger">High Risk</Badge>;
      default:
        return <Badge variant="neutral">{value}</Badge>;
    }
  }

  return <Badge variant="neutral">{value}</Badge>;
};
