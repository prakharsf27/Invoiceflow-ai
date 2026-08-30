import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { companyService } from '../services/companyService';
import { InviteMemberModal } from '../components/team/InviteMemberModal';
import { RemoveMemberModal } from '../components/team/RemoveMemberModal';
import type { CompanyProfile, TeamMember, TeamInvitation } from '../types';
import {
  RefreshCw,
  Building2,
  Users,
  UserPlus,
  ShieldCheck,
  Trash2,
  Clock,
  Mail,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { showToast, resetToDefault } = useApp();
  const { user, isOwner, updateUserCompany } = useAuth();

  const [activeTab, setActiveTab] = useState<'profile' | 'team' | 'ai' | 'rules'>('profile');

  // Company Profile state
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Profile Form fields
  const [companyName, setCompanyName] = useState('');
  const [gstin, setGstin] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');

  // Team state
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [isTeamLoading, setIsTeamLoading] = useState(false);

  // Modals
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);

  // Copied token feedback
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const fetchProfileData = async () => {
    setIsProfileLoading(true);
    try {
      const data = await companyService.getProfile();
      setProfile(data);
      setCompanyName(data.name || user?.companyName || '');
      setGstin(data.gstin || '');
      setEmail(data.email || user?.email || '');
      setPhone(data.phone || '');
      setAddress(data.address || '');
      setCity(data.city || '');
      setState(data.state || '');
      setPincode(data.pincode || '');
    } catch (err) {
      console.error('Failed to load company profile:', err);
    } finally {
      setIsProfileLoading(false);
    }
  };

  const fetchTeamData = async () => {
    setIsTeamLoading(true);
    try {
      const data = await companyService.getTeam();
      setMembers(data.members || []);
      setInvitations(data.invitations || []);
    } catch (err) {
      console.error('Failed to load team data:', err);
    } finally {
      setIsTeamLoading(false);
    }
  };

  useEffect(() => {
    fetchProfileData();
    fetchTeamData();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      showToast('Company name is required.', 'error');
      return;
    }

    setIsSavingProfile(true);
    try {
      const updated = await companyService.updateProfile({
        name: companyName.trim(),
        gstin: gstin.trim().toUpperCase(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
      });
      setProfile(updated);
      updateUserCompany(updated.name);
      showToast('Company profile & policies updated successfully!', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to update company profile.', 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: string) => {
    try {
      await companyService.updateMemberRole(memberId, newRole);
      showToast(`Member role updated to ${newRole}.`, 'success');
      fetchTeamData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to update member role.', 'error');
    }
  };

  const handleCopyLink = (token: string, inviteEmail: string) => {
    const fullLink = `${window.location.origin}/register?token=${token}&email=${encodeURIComponent(inviteEmail)}`;
    navigator.clipboard.writeText(fullLink);
    setCopiedToken(token);
    showToast('Invitation link copied to clipboard!', 'info');
    setTimeout(() => setCopiedToken(null), 2500);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Top Title & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            Settings & Organization Workspace
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage organization workspace, team member authorizations, AI clearance rules, and fraud thresholds.
          </p>
        </div>

        <Button
          onClick={resetToDefault}
          variant="outline"
          size="sm"
          className="text-slate-600 border-slate-300 cursor-pointer gap-1.5 self-start sm:self-auto"
          title="Reset application dataset to original state"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Reset Demo Dataset</span>
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('profile')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'profile' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Business Profile
        </button>
        <button
          onClick={() => setActiveTab('team')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'team' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Team & Members ({members.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('ai')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'ai' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          AI Automation Rules
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'rules' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Risk & Fraud Thresholds
        </button>
      </div>

      {/* TAB 1: Business Profile */}
      {activeTab === 'profile' && (
        <Card className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-brand-600" />
                <span>Organization Details</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Workspace information used for automated 3-way PO matching and supplier correspondence.
              </p>
            </div>
            {isOwner && (
              <Badge variant="purple" size="sm">Workspace Owner Access</Badge>
            )}
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-slate-700 font-semibold">Business Legal Name *</label>
                <input
                  type="text"
                  required
                  disabled={!isOwner}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Apex Global Technologies Pvt Ltd"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-700 font-semibold">GSTIN</label>
                <input
                  type="text"
                  disabled={!isOwner}
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value)}
                  placeholder="29AAACA1234F1Z5"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-700 font-semibold">Primary Contact Email</label>
                <input
                  type="email"
                  disabled={!isOwner}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="finance@apextech.com"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-700 font-semibold">Phone Number</label>
                <input
                  type="text"
                  disabled={!isOwner}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 80 4123 4567"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-slate-700 font-semibold">Office Address</label>
              <input
                type="text"
                disabled={!isOwner}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Tower B, Prestige Tech Park, Marathahalli-Sarjapur Outer Ring Rd"
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-70 disabled:cursor-not-allowed"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-slate-700 font-semibold">City</label>
                <input
                  type="text"
                  disabled={!isOwner}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Bangalore"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-700 font-semibold">State</label>
                <input
                  type="text"
                  disabled={!isOwner}
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="Karnataka"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-700 font-semibold">PIN Code</label>
                <input
                  type="text"
                  disabled={!isOwner}
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  placeholder="560103"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-70 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {isOwner ? (
              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSavingProfile}
                  className="cursor-pointer gap-1.5"
                >
                  {isSavingProfile && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Organization Changes</span>
                </Button>
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 italic pt-1">
                Only workspace Owners can modify organizational profile information.
              </p>
            )}
          </form>
        </Card>
      )}

      {/* TAB 2: Team & Members */}
      {activeTab === 'team' && (
        <div className="space-y-5">
          <Card className="p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-brand-600" />
                  <span>Team Members & Authorizations</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Colleagues in <strong>{user?.companyName || 'your organization'}</strong> who share access to company invoices, suppliers, and PO matching.
                </p>
              </div>

              {isOwner && (
                <Button
                  onClick={() => setIsInviteModalOpen(true)}
                  variant="brand"
                  size="sm"
                  className="cursor-pointer gap-1.5 shrink-0"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Add Team Member</span>
                </Button>
              )}
            </div>

            {/* Members Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Member Name</th>
                    <th className="py-3 px-4">Email Address</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Access Level</th>
                    {isOwner && <th className="py-3 px-4 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {members.map((member) => (
                    <tr key={member.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-slate-900 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center">
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span>{member.name}</span>
                          {member.isCurrentUser && (
                            <span className="ml-1.5 text-[10px] bg-slate-200 text-slate-700 font-bold px-1.5 py-0.5 rounded">
                              You
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-600">
                        {member.email}
                      </td>
                      <td className="py-3.5 px-4">
                        {isOwner && !member.isCurrentUser ? (
                          <select
                            value={member.role}
                            onChange={(e) => handleRoleChange(member.id, e.target.value)}
                            className="text-xs bg-slate-50 border border-slate-200 rounded-md p-1 font-medium focus:ring-1 focus:ring-brand-500"
                          >
                            <option value="owner">Owner</option>
                            <option value="member">Member</option>
                            <option value="accountant">Accountant</option>
                            <option value="reviewer">Reviewer</option>
                          </select>
                        ) : (
                          <span className="font-semibold capitalize text-slate-800">
                            {member.role === 'finance_admin' ? 'Owner (Admin)' : member.role}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge
                          variant={member.isOwner ? 'purple' : 'neutral'}
                          size="sm"
                          className="capitalize"
                        >
                          {member.isOwner ? 'Owner' : 'Member'}
                        </Badge>
                      </td>
                      {isOwner && (
                        <td className="py-3.5 px-4 text-right">
                          {!member.isCurrentUser ? (
                            <button
                              onClick={() => setMemberToRemove(member)}
                              className="text-xs text-rose-600 hover:text-rose-800 font-medium cursor-pointer inline-flex items-center gap-1 p-1 hover:bg-rose-50 rounded"
                              title="Remove member from company"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px] italic">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pending Invitations Section (Owners only) */}
            {isOwner && invitations.length > 0 && (
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <h4 className="text-xs font-bold text-slate-900">Pending Team Invitations ({invitations.length})</h4>
                </div>

                <div className="border border-amber-200 bg-amber-50/30 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-amber-50 border-b border-amber-200 text-amber-900 font-semibold">
                      <tr>
                        <th className="py-2.5 px-4">Invited Email</th>
                        <th className="py-2.5 px-4">Assigned Role</th>
                        <th className="py-2.5 px-4">Invited By</th>
                        <th className="py-2.5 px-4 text-right">Invitation Link</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-100 text-slate-700">
                      {invitations.map((inv) => (
                        <tr key={inv.id}>
                          <td className="py-2.5 px-4 font-mono font-medium text-slate-900">
                            {inv.email}
                          </td>
                          <td className="py-2.5 px-4 capitalize font-semibold text-slate-800">
                            {inv.role}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600">
                            {inv.invitedByName}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              onClick={() => handleCopyLink(inv.token, inv.email)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 rounded-md text-[11px] font-semibold transition-colors cursor-pointer"
                            >
                              {copiedToken === inv.token ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span>Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy Link</span>
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 3: AI Automation Rules */}
      {activeTab === 'ai' && (
        <Card className="p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Autonomous Processing Configuration</h3>
          <div className="space-y-3 text-xs text-slate-700">
            <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer">
              <input type="checkbox" defaultChecked className="rounded text-brand-600 focus:ring-brand-500" />
              <div>
                <span className="font-semibold text-slate-900 block">Auto-schedule 100% matched PO invoices</span>
                <span className="text-slate-500">Invoices with 0% rate variance and valid GSTIN are queued directly for payout.</span>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer">
              <input type="checkbox" defaultChecked className="rounded text-brand-600 focus:ring-brand-500" />
              <div>
                <span className="font-semibold text-slate-900 block">Perform 3-way line item price validation</span>
                <span className="text-slate-500">Flags invoice if any individual item price exceeds PO quote by &gt; 1%.</span>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer">
              <input type="checkbox" defaultChecked className="rounded text-brand-600 focus:ring-brand-500" />
              <div>
                <span className="font-semibold text-slate-900 block">Auto-detect duplicate invoices via neural fingerprint</span>
                <span className="text-slate-500">Alerts if invoice matches past 90 days line items by &gt; 80% similarity.</span>
              </div>
            </label>
          </div>
          {isOwner && (
            <div className="pt-2">
              <Button onClick={() => showToast('AI rules saved.', 'success')} variant="primary" size="sm" className="cursor-pointer">
                Update AI Rules
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* TAB 4: Risk & Fraud Thresholds */}
      {activeTab === 'rules' && (
        <Card className="p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Fraud Prevention & Bank Security</h3>
          <div className="space-y-3 text-xs text-slate-700">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg space-y-1">
              <span className="font-semibold text-rose-900 block">Strict Bank Account Change Verification</span>
              <p className="text-rose-700 text-[11px]">
                Any new bank account on a vendor invoice triggers mandatory manual verification before payout is permitted.
              </p>
            </div>
          </div>
          {isOwner && (
            <div className="pt-2">
              <Button onClick={() => showToast('Security policies saved.', 'success')} variant="primary" size="sm" className="cursor-pointer">
                Save Security Rules
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Invite Member Modal */}
      <InviteMemberModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onSuccess={() => {
          fetchTeamData();
          showToast('Team invitation created.', 'success');
        }}
      />

      {/* Remove Member Modal */}
      <RemoveMemberModal
        isOpen={Boolean(memberToRemove)}
        member={memberToRemove}
        onClose={() => setMemberToRemove(null)}
        onSuccess={() => {
          fetchTeamData();
          showToast('Member removed from organization.', 'success');
        }}
      />
    </div>
  );
};
