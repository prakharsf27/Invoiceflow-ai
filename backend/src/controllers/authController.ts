import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserModel, UserRole } from '../models/User.js';
import { JWT_SECRET } from '../middleware/auth.js';

/**
 * Helper to generate JWT token with multi-tenant company context.
 */
const generateAuthToken = (user: {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  companyId: string;
  companyName: string;
}): string => {
  return jwt.sign(
    {
      userId: user.id,
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      companyName: user.companyName,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

/**
 * POST /api/auth/register
 * Register a new user and create an isolated company account.
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, companyName, role } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({
        success: false,
        error: 'User full name is required.',
      });
      return;
    }

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      res.status(400).json({
        success: false,
        error: 'A valid email address is required.',
      });
      return;
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long.',
      });
      return;
    }

    const cleanEmail = email.toLowerCase().trim();
    const existingUser = await UserModel.findOne({ email: cleanEmail });
    if (existingUser) {
      res.status(409).json({
        success: false,
        error: `An account with email "${cleanEmail}" already exists. Please log in instead.`,
      });
      return;
    }

    const cleanCompanyName = typeof companyName === 'string' && companyName.trim() !== ''
      ? companyName.trim()
      : `${name.trim()}'s Organization`;

    const companySlug = cleanCompanyName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 12);
    const companyId = `comp-${companySlug}-${Date.now().toString(36)}`;
    const userId = `usr-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

    // Hash password securely with bcrypt
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const validRoles: UserRole[] = ['finance_admin', 'accountant', 'reviewer'];
    const userRole: UserRole = validRoles.includes(role) ? role : 'finance_admin';

    const newUser = await UserModel.create({
      id: userId,
      name: name.trim(),
      email: cleanEmail,
      passwordHash,
      role: userRole,
      companyId,
      companyName: cleanCompanyName,
      isActive: true,
    });

    const userPayload = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      companyId: newUser.companyId,
      companyName: newUser.companyName,
    };

    const token = generateAuthToken(userPayload);

    res.status(201).json({
      success: true,
      message: 'Registration successful.',
      token,
      user: userPayload,
    });
  } catch (error: any) {
    console.error('❌ Registration error:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Registration failed.',
    });
  }
};

/**
 * POST /api/auth/login
 * Authenticate user credentials and return JWT token.
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: 'Email and password are required.',
      });
      return;
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const user = await UserModel.findOne({ email: cleanEmail });

    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        error: 'Invalid email or password.',
      });
      return;
    }

    const isPasswordValid = await bcrypt.compare(String(password), user.passwordHash);
    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        error: 'Invalid email or password.',
      });
      return;
    }

    const userPayload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      companyName: user.companyName,
    };

    const token = generateAuthToken(userPayload);

    res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: userPayload,
    });
  } catch (error: any) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Authentication failed.',
    });
  }
};

/**
 * GET /api/auth/me
 * Return current authenticated user profile.
 */
export const getCurrentUser = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated.',
      });
      return;
    }

    const user = await UserModel.findOne({ id: req.user.userId }).select('-passwordHash');
    if (!user || !user.isActive) {
      res.status(404).json({
        success: false,
        error: 'User account not found or deactivated.',
      });
      return;
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        companyId: user.companyId,
        companyName: user.companyName,
      },
    });
  } catch (error: any) {
    console.error('❌ Get current user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user profile.',
    });
  }
};

/**
 * POST /api/auth/logout
 * Client-side token invalidation confirmation.
 */
export const logout = async (_req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    message: 'Logged out successfully.',
  });
};
