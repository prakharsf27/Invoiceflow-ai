import { fetchApi } from './api';
import type { CompanyProfile, TeamMember, TeamInvitation } from '../types';

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
    const res = await fetchApi<{ success: boolean; data: CompanyProfile }>('/company/profile');
    return res.data;
  },

  /**
   * Update company workspace profile and rules (Owner only).
   */
  updateProfile: async (payload: Partial<CompanyProfile>): Promise<CompanyProfile> => {
    const res = await fetchApi<{ success: boolean; data: CompanyProfile }>('/company/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  /**
   * Get team members and pending invitations.
   */
  getTeam: async (): Promise<TeamDataResponse> => {
    const res = await fetchApi<{ success: boolean; data: TeamDataResponse }>('/company/team');
    return res.data;
  },

  /**
   * Invite a new team member by email (Owner only).
   */
  inviteMember: async (payload: {
    email: string;
    role?: 'member' | 'accountant' | 'reviewer' | 'owner';
    name?: string;
  }): Promise<{ id: string; email: string; role: string; token: string; invitationLink: string }> => {
    const res = await fetchApi<{
      success: boolean;
      message: string;
      data: { id: string; email: string; role: string; token: string; invitationLink: string };
    }>('/company/team/invite', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
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
  }): Promise<{ token: string; user: any }> => {
    const res = await fetchApi<{ success: boolean; token: string; user: any }>(
      '/company/team/accept-invite',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    return res;
  },
};
