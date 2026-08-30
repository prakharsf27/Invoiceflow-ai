import { fetchApi } from './api';
import type { CompanyProfile, TeamMember, TeamInvitation, InvitationInfo } from '../types';

export interface TeamDataResponse {
  members: TeamMember[];
  invitations: TeamInvitation[];
  isOwner: boolean;
  currentUserRole: string;
}

export const companyService = {
  /**
   * Get company workspace profile and rules.
   */
  getProfile: async (): Promise<CompanyProfile> => {
    return await fetchApi<CompanyProfile>('/company/profile');
  },

  /**
   * Update company workspace profile and rules (Owner only).
   */
  updateProfile: async (payload: Partial<CompanyProfile>): Promise<CompanyProfile> => {
    return await fetchApi<CompanyProfile>('/company/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Get team members and pending invitations.
   */
  getTeam: async (): Promise<TeamDataResponse> => {
    return await fetchApi<TeamDataResponse>('/company/team');
  },

  /**
   * Generate a shareable invitation link for a new team member (Owner only).
   */
  inviteMember: async (payload: {
    email: string;
    role?: 'member' | 'accountant' | 'reviewer' | 'owner';
    name?: string;
  }): Promise<{ id: string; email: string; role: string; token: string; companyName?: string; invitationLink: string; expiresAt?: string }> => {
    return await fetchApi<{
      id: string;
      email: string;
      role: string;
      token: string;
      companyName?: string;
      invitationLink: string;
      expiresAt?: string;
    }>('/company/team/invite', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Get public metadata for an invitation token.
   */
  getInvitationInfo: async (token: string): Promise<InvitationInfo> => {
    return await fetchApi<InvitationInfo>(`/company/team/invitation-info/${encodeURIComponent(token)}`);
  },

  /**
   * Revoke a pending invitation link (Owner only).
   */
  revokeInvitation: async (invitationId: string): Promise<{ success: boolean; message: string }> => {
    return await fetchApi<{ success: boolean; message: string }>(`/company/team/invitations/${encodeURIComponent(invitationId)}`, {
      method: 'DELETE',
    });
  },

  /**
   * Remove a member from the company workspace (Owner only).
   */
  removeMember: async (memberId: string): Promise<void> => {
    await fetchApi(`/company/team/${memberId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Update team member role (Owner only).
   */
  updateMemberRole: async (memberId: string, role: string): Promise<void> => {
    await fetchApi(`/company/team/${memberId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  },

  /**
   * Accept an invitation token to join a company workspace.
   */
  acceptInvitation: async (payload: {
    token: string;
    name?: string;
    password?: string;
  }): Promise<{ token: string; user: any; message?: string }> => {
    return await fetchApi<{ token: string; user: any; message?: string }>(
      '/company/team/accept-invite',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },
};
