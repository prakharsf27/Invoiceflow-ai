import mongoose, { Schema, Document } from 'mongoose';

export type UserRole = 'finance_admin' | 'accountant' | 'reviewer';

export interface IUserDocument extends Document {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  companyId: string;
  companyName: string;
  isActive: boolean;
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
      enum: ['finance_admin', 'accountant', 'reviewer'],
      default: 'finance_admin',
    },
    companyId: { type: String, required: true, index: true },
    companyName: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const UserModel = mongoose.model<IUserDocument>('User', UserSchema, 'users');
