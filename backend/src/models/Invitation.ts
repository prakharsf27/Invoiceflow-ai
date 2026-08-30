import mongoose, { Schema, Document } from 'mongoose';
import { UserRole } from './User.js';

export interface IInvitationDocument extends Document {
  id: string;
  companyId: string;
  companyName: string;
  email: string;
  role: UserRole;
  invitedBy: string;
  invitedByName: string;
  token: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const InvitationSchema = new Schema<IInvitationDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    companyId: { type: String, required: true, index: true },
    companyName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    role: {
      type: String,
      enum: ['owner', 'member', 'finance_admin', 'accountant', 'reviewer'],
      default: 'member',
    },
    invitedBy: { type: String, required: true },
    invitedByName: { type: String, required: true },
    token: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'revoked', 'expired'],
      default: 'pending',
      index: true,
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

InvitationSchema.index({ companyId: 1, email: 1 });

export const InvitationModel = mongoose.model<IInvitationDocument>('Invitation', InvitationSchema, 'invitations');
