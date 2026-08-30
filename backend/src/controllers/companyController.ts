import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { CompanyModel } from '../models/Company.js';
import { UserModel, UserRole } from '../models/User.js';
import { InvitationModel } from '../models/Invitation.js';
import { isOwnerRole, getJwtSecret } from '../middleware/auth.js';

/**
 * Helper to ensure a Company record exists in database for any active companyId.
 */
export const getOrCreateCompany = async (
  companyId: string,
  defaultName: string = 'My Company',
  ownerId?: string
) => {
  let company = await CompanyModel.findOne({ id: companyId });
  if (!company) {
    company = await CompanyModel.create({
      id: companyId,
      name: defaultName,
      ownerId: ownerId || 'usr-system',
      membersCount: await UserModel.countDocuments({ companyId, isActive: true }) || 1,
    });
  }
  return company;
};

/**
 * GET /api/company/profile
 * Get authenticated company workspace profile and settings.
 */
export const getCompanyProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const company = await getOrCreateCompany(companyId, req.user?.companyName, req.user?.userId);
    const membersCount = await UserModel.countDocuments({ companyId, isActive: true });

    res.json({
      success: true,
      data: {
        id: company.id,
        name: company.name,
        ownerId: company.ownerId,
        gstin: company.gstin || '',
        email: company.email || '',
        phone: company.phone || '',
        address: company.address || '',
        city: company.city || '',
        state: company.state || '',
        pincode: company.pincode || '',
        settings: company.settings || {
          autoClearanceThreshold: 500000,
          riskTolerance: 'medium',
          requirePoMatch: true,
        },
        membersCount,
        isOwner: isOwnerRole(req.user?.role),
        createdAt: company.createdAt,
      },
    });
  } catch (error: any) {
    console.error('❌ Error fetching company profile:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve company profile' });
  }
};

/**
 * PUT /api/company/profile
 * Update company workspace profile and settings (Restricted to OWNER).
 */
export const updateCompanyProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { name, gstin, email, phone, address, city, state, pincode, settings } = req.body;

    const company = await getOrCreateCompany(companyId, req.user?.companyName, req.user?.userId);

    if (name && typeof name === 'string' && name.trim()) {
      company.name = name.trim();
      // Update company name on all active users
      await UserModel.updateMany({ companyId }, { $set: { companyName: company.name } });
    }
    if (gstin !== undefined) company.gstin = String(gstin).trim();
    if (email !== undefined) company.email = String(email).trim().toLowerCase();
    if (phone !== undefined) company.phone = String(phone).trim();
    if (address !== undefined) company.address = String(address).trim();
    if (city !== undefined) company.city = String(city).trim();
    if (state !== undefined) company.state = String(state).trim();
    if (pincode !== undefined) company.pincode = String(pincode).trim();

    if (settings && typeof settings === 'object') {
      company.settings = {
        autoClearanceThreshold: Number(settings.autoClearanceThreshold) || 500000,
        riskTolerance: ['low', 'medium', 'high'].includes(settings.riskTolerance)
          ? settings.riskTolerance
          : 'medium',
        requirePoMatch: Boolean(settings.requirePoMatch),
      };
    }

    await company.save();

    res.json({
      success: true,
      message: 'Company profile and rules updated successfully.',
      data: {
        id: company.id,
        name: company.name,
        gstin: company.gstin,
        email: company.email,
        phone: company.phone,
        address: company.address,
        city: company.city,
        state: company.state,
        pincode: company.pincode,
        settings: company.settings,
        isOwner: true,
      },
    });
  } catch (error: any) {
    console.error('❌ Error updating company profile:', error);
    res.status(500).json({ success: false, error: 'Failed to update company profile' });
  }
};

/**
 * GET /api/company/team
 * Get all members and pending invitations for the authenticated company.
 */
export const getTeamMembers = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const members = await UserModel.find({ companyId, isActive: true })
      .select('-passwordHash')
      .sort({ createdAt: 1 });

    const isOwner = isOwnerRole(req.user?.role);
    let invitations: any[] = [];

    if (isOwner) {
      invitations = await InvitationModel.find({
        companyId,
        status: 'pending',
        expiresAt: { $gt: new Date() },
      }).sort({ createdAt: -1 });
    }

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

    res.json({
      success: true,
      data: {
        members: members.map((m) => ({
          id: m.id,
          name: m.name,
          email: m.email,
          role: m.role,
          isOwner: isOwnerRole(m.role),
          isCurrentUser: m.id === req.user?.userId,
          createdAt: m.createdAt,
        })),
        invitations: invitations.map((inv) => ({
          id: inv.id,
          email: inv.email,
          role: inv.role,
          invitedByName: inv.invitedByName,
          token: inv.token,
          invitationLink: `${frontendUrl}/invite/${inv.token}`,
          createdAt: inv.createdAt,
          expiresAt: inv.expiresAt,
        })),
        isOwner,
        currentUserRole: req.user?.role,
      },
    });
  } catch (error: any) {
    console.error('❌ Error fetching team members:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve team members' });
  }
};

/**
 * POST /api/company/team/invite
 * Invite a new team member to the company workspace (Restricted to OWNER).
 */
export const inviteTeamMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { email, role = 'member', name } = req.body;

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      res.status(400).json({ success: false, error: 'A valid email address is required.' });
      return;
    }

    const cleanEmail = email.toLowerCase().trim();

    // Check if user is already an active member of THIS company
    const existingMember = await UserModel.findOne({ companyId, email: cleanEmail, isActive: true });
    if (existingMember) {
      res.status(409).json({
        success: false,
        error: `User "${cleanEmail}" is already an active member of this organization.`,
      });
      return;
    }

    const validRoles: UserRole[] = ['member', 'accountant', 'reviewer', 'owner', 'finance_admin'];
    const assignedRole: UserRole = validRoles.includes(role) ? role : 'member';

    const company = await getOrCreateCompany(companyId, req.user?.companyName, req.user?.userId);

    // Create cryptographically secure token & 7-day expiration
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await InvitationModel.findOneAndUpdate(
      { companyId, email: cleanEmail },
      {
        $set: {
          id: `invit-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
          companyId,
          companyName: company.name,
          email: cleanEmail,
          role: assignedRole,
          invitedBy: req.user?.userId || 'usr-owner',
          invitedByName: req.user?.name || 'Workspace Owner',
          token,
          status: 'pending',
          expiresAt,
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
    const invitationLink = `${frontendUrl}/invite/${invitation.token}`;

    console.log(`✉️ [Team] Created shareable invitation for "${cleanEmail}" (${invitationLink})`);

    res.status(201).json({
      success: true,
      message: `Invitation generated successfully for ${cleanEmail}.`,
      data: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        token: invitation.token,
        companyName: company.name,
        invitationLink,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error: any) {
    console.error('❌ Error inviting team member:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to create team invitation' });
  }
};

/**
 * GET /api/company/team/invitation-info/:token
 * Public endpoint to retrieve invitation metadata for /invite/:token page.
 */
export const getInvitationInfo = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    if (!token) {
      res.status(400).json({ success: false, error: 'Invitation token is required.' });
      return;
    }

    const invitation = await InvitationModel.findOne({ token });
    if (!invitation) {
      res.status(404).json({
        success: false,
        error: 'This invitation is invalid or does not exist.',
        status: 'not_found',
      });
      return;
    }

    if (invitation.status === 'revoked') {
      res.status(400).json({
        success: false,
        error: 'This invitation is no longer available.',
        status: 'revoked',
        companyName: invitation.companyName,
      });
      return;
    }

    if (invitation.status === 'accepted') {
      res.status(400).json({
        success: false,
        error: 'This invitation has already been accepted.',
        status: 'accepted',
        companyName: invitation.companyName,
      });
      return;
    }

    if (new Date() > invitation.expiresAt || invitation.status === 'expired') {
      res.status(400).json({
        success: false,
        error: 'Invitation expired. Ask the workspace owner to generate a new invitation.',
        status: 'expired',
        companyName: invitation.companyName,
      });
      return;
    }

    res.json({
      success: true,
      data: {
        id: invitation.id,
        companyId: invitation.companyId,
        companyName: invitation.companyName,
        email: invitation.email,
        role: invitation.role,
        invitedByName: invitation.invitedByName,
        expiresAt: invitation.expiresAt,
        status: 'pending',
      },
    });
  } catch (error: any) {
    console.error('❌ Error retrieving invitation info:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve invitation information' });
  }
};

/**
 * DELETE /api/company/team/invitations/:invitationId
 * Revoke a pending invitation (Restricted to OWNER).
 */
export const revokeInvitation = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    const { invitationId } = req.params;

    if (!companyId) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const invitation = await InvitationModel.findOne({ id: invitationId, companyId });
    if (!invitation) {
      res.status(404).json({ success: false, error: 'Invitation not found.' });
      return;
    }

    invitation.status = 'revoked';
    await invitation.save();

    res.json({
      success: true,
      message: `Invitation for ${invitation.email} has been revoked.`,
    });
  } catch (error: any) {
    console.error('❌ Error revoking invitation:', error);
    res.status(500).json({ success: false, error: 'Failed to revoke invitation' });
  }
};

/**
 * DELETE /api/company/team/:memberId
 * Remove a member from the company workspace (Restricted to OWNER).
 */
export const removeTeamMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    const currentUserId = req.user?.userId;
    const targetMemberId = req.params.memberId;

    if (!companyId || !currentUserId) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    // Protection 1: Owner cannot remove themselves
    if (targetMemberId === currentUserId) {
      res.status(400).json({
        success: false,
        error: 'You cannot remove yourself from your own company workspace.',
      });
      return;
    }

    // Protection 2: Target must belong to the same company
    const targetUser = await UserModel.findOne({ id: targetMemberId, companyId });
    if (!targetUser) {
      res.status(404).json({
        success: false,
        error: 'Team member not found or does not belong to your organization.',
      });
      return;
    }

    // Protection 3: Cannot remove if target is the last owner
    if (isOwnerRole(targetUser.role)) {
      const ownerCount = await UserModel.countDocuments({
        companyId,
        isActive: true,
        role: { $in: ['owner', 'finance_admin'] },
      });
      if (ownerCount <= 1) {
        res.status(400).json({
          success: false,
          error: 'Cannot remove the sole owner of the company workspace.',
        });
        return;
      }
    }

    // Remove user's membership from company without deleting account
    targetUser.companyId = `company-archived-${Date.now().toString(36)}`;
    targetUser.companyName = 'Inactive Workspace';
    targetUser.role = 'member';
    targetUser.isActive = false;
    await targetUser.save();

    // Update company member count
    const remainingCount = await UserModel.countDocuments({ companyId, isActive: true });
    await CompanyModel.updateOne({ id: companyId }, { $set: { membersCount: remainingCount } });

    console.log(`🚫 [Team] Removed member "${targetUser.name}" (${targetMemberId}) from company "${companyId}"`);

    res.json({
      success: true,
      message: `Team member "${targetUser.name}" has been removed from the organization workspace.`,
    });
  } catch (error: any) {
    console.error('❌ Error removing team member:', error);
    res.status(500).json({ success: false, error: 'Failed to remove team member' });
  }
};

/**
 * PATCH /api/company/team/:memberId/role
 * Update team member role (Restricted to OWNER).
 */
export const updateMemberRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user?.companyId;
    const targetMemberId = req.params.memberId;
    const { role } = req.body;

    if (!companyId) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const validRoles: UserRole[] = ['owner', 'member', 'finance_admin', 'accountant', 'reviewer'];
    if (!role || !validRoles.includes(role)) {
      res.status(400).json({ success: false, error: 'A valid role must be specified.' });
      return;
    }

    const targetUser = await UserModel.findOne({ id: targetMemberId, companyId, isActive: true });
    if (!targetUser) {
      res.status(404).json({ success: false, error: 'Team member not found.' });
      return;
    }

    targetUser.role = role;
    await targetUser.save();

    res.json({
      success: true,
      message: `Role for ${targetUser.name} updated to "${role}".`,
      data: {
        id: targetUser.id,
        name: targetUser.name,
        role: targetUser.role,
      },
    });
  } catch (error: any) {
    console.error('❌ Error updating member role:', error);
    res.status(500).json({ success: false, error: 'Failed to update member role' });
  }
};

/**
 * POST /api/company/team/accept-invite
 * Accept a pending company invitation with token.
 */
export const acceptInvitation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, name, password } = req.body;

    if (!token) {
      res.status(400).json({ success: false, error: 'Invitation token is required.' });
      return;
    }

    const invitation = await InvitationModel.findOne({ token });

    if (!invitation) {
      res.status(404).json({
        success: false,
        error: 'This invitation is invalid or does not exist.',
      });
      return;
    }

    if (invitation.status === 'revoked') {
      res.status(400).json({
        success: false,
        error: 'This invitation is no longer available.',
      });
      return;
    }

    if (invitation.status === 'accepted') {
      res.status(400).json({
        success: false,
        error: 'This invitation has already been accepted.',
      });
      return;
    }

    if (new Date() > invitation.expiresAt || invitation.status === 'expired') {
      res.status(400).json({
        success: false,
        error: 'Invitation expired. Ask the workspace owner to generate a new invitation.',
      });
      return;
    }

    // Check if caller is authenticated with JWT
    let callingUserEmail: string | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded: any = jwt.verify(authHeader.split(' ')[1], getJwtSecret());
        callingUserEmail = decoded.email?.toLowerCase().trim();
      } catch {
        // Token expired/invalid, proceed to body password flow
      }
    }

    // If caller is authenticated, verify email matches invited email
    if (callingUserEmail && callingUserEmail !== invitation.email.toLowerCase()) {
      res.status(400).json({
        success: false,
        error: `This invitation was created for ${invitation.email}. You are currently signed in as ${callingUserEmail}. Please sign in with the invited email account.`,
      });
      return;
    }

    let user = await UserModel.findOne({ email: invitation.email.toLowerCase() });
    const saltRounds = 10;

    if (user) {
      user.companyId = invitation.companyId;
      user.companyName = invitation.companyName;
      user.role = invitation.role;
      user.isActive = true;
      if (password && password.length >= 6) {
        user.passwordHash = await bcrypt.hash(password, saltRounds);
      }
      if (name && name.trim()) {
        user.name = name.trim();
      }
      await user.save();
    } else {
      if (!password || password.length < 6) {
        res.status(400).json({ success: false, error: 'Password of at least 6 characters is required to create your account.' });
        return;
      }
      const userId = `usr-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      user = await UserModel.create({
        id: userId,
        name: name?.trim() || invitation.email.split('@')[0],
        email: invitation.email.toLowerCase(),
        passwordHash,
        role: invitation.role,
        companyId: invitation.companyId,
        companyName: invitation.companyName,
        isActive: true,
        invitedBy: invitation.invitedBy,
      });
    }

    // Mark invitation accepted
    invitation.status = 'accepted';
    await invitation.save();

    // Update company members count
    const membersCount = await UserModel.countDocuments({ companyId: invitation.companyId, isActive: true });
    await CompanyModel.updateOne({ id: invitation.companyId }, { $set: { membersCount } });

    // Generate fresh JWT token
    const userPayload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      companyName: user.companyName,
    };

    const authToken = jwt.sign(
      {
        userId: user.id,
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.companyId,
        companyName: user.companyName,
      },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    console.log(`🎉 [Team] User "${user.email}" successfully accepted invitation to join "${invitation.companyName}" as ${invitation.role}`);

    res.json({
      success: true,
      message: `Welcome to ${invitation.companyName}! Invitation accepted.`,
      token: authToken,
      user: userPayload,
    });
  } catch (error: any) {
    console.error('❌ Error accepting invitation:', error);
    res.status(500).json({ success: false, error: error?.message || 'Failed to accept invitation.' });
  }
};
