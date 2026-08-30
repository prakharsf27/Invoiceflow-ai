import mongoose, { Schema, Document } from 'mongoose';

export type UserRole = 'owner' | 'member' | 'finance_admin' | 'accountant' | 'reviewer';

export interface IUserDocument extends Document {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  companyId: string;
  companyName: string;
  isActive: boolean;
  invitedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUserDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['owner', 'member', 'finance_admin', 'accountant', 'reviewer'],
      default: 'owner',
    },
    companyId: { type: String, required: true, index: true },
    companyName: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    invitedBy: { type: String },
  },
  { timestamps: true }
);

UserSchema.index({ companyId: 1, email: 1 });

export const UserModel = mongoose.model<IUserDocument>('User', UserSchema, 'users');
