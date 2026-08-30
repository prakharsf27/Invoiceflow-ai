import { Router } from 'express';
import {
  getCompanyProfile,
  updateCompanyProfile,
  getTeamMembers,
  inviteTeamMember,
  removeTeamMember,
  updateMemberRole,
  acceptInvitation,
  getInvitationInfo,
  revokeInvitation,
} from '../controllers/companyController.js';
import { requireAuth, requireOwner } from '../middleware/auth.js';

const router = Router();

// Public invitation endpoints
router.get('/team/invitation-info/:token', getInvitationInfo);
router.post('/team/accept-invite', acceptInvitation);

// Protected routes (require company authentication)
router.get('/profile', requireAuth, getCompanyProfile);
router.put('/profile', requireAuth, requireOwner, updateCompanyProfile);

router.get('/team', requireAuth, getTeamMembers);
router.post('/team/invite', requireAuth, requireOwner, inviteTeamMember);
router.delete('/team/invitations/:invitationId', requireAuth, requireOwner, revokeInvitation);
router.delete('/team/:memberId', requireAuth, requireOwner, removeTeamMember);
router.patch('/team/:memberId/role', requireAuth, requireOwner, updateMemberRole);

export default router;
