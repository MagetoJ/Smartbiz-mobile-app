import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Users as UsersIcon, AlertCircle, CheckCircle, UserPlus, MapPin, Key } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { api, TenantUser, UserAdd, UserInvite, UserTenantUpdate, Branch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import DeleteUserModal from '../components/DeleteUserModal';

export default function Users() {
  const { token, user: currentUser, tenant } = useAuth();
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingUser, setEditingUser] = useState<TenantUser | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [modalMode, setModalMode] = useState<'add' | 'invite'>('add'); // Track which type of form to show
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<TenantUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{ id: number; name: string; email: string } | null>(null);

  const [addFormData, setAddFormData] = useState<UserAdd>({
    email: '',
    full_name: '',
    password: '',
    role: 'staff',
    branch_id: undefined,
  });

  const [formData, setFormData] = useState<UserInvite>({
    email: '',
    full_name: '',
    role: 'staff',
    branch_id: undefined,
  });

  const [editFormData, setEditFormData] = useState<UserTenantUpdate>({
    role: 'staff',
    is_active: true,
    branch_id: undefined,
    full_name: '',
    email: '',
  });

  useEffect(() => {
    fetchUsers();
    fetchBranches(); // Always fetch branches (simplified - no organization needed)
  }, [token]);

  const fetchBranches = async () => {
    if (!token) return;
    try {
      setIsLoadingBranches(true);
      const data = await api.getBranches(token);
      setBranches(data);
    } catch (error: any) {
      console.error('Error fetching branches:', error);
    } finally {
      setIsLoadingBranches(false);
    }
  };

  const fetchUsers = async () => {
    if (!token) return;
    try {
      setIsLoading(true);
      const data = await api.getTenantUsers(token);
      console.log('Users data received:', data);
      setUsers(data);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      setErrorMessage(error.message || 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await api.addUser(token!, addFormData);
      setSuccessMessage('User added successfully');

      setIsModalOpen(false);
      resetForm();
      fetchUsers();
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to add user');
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await api.inviteUser(token!, formData);
      setSuccessMessage('User invited successfully');

      setIsModalOpen(false);
      resetForm();
      fetchUsers();
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to invite user');
    }
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!editingUser) return;

    try {
      await api.updateUserInTenant(token!, editingUser.id, editFormData);
      setSuccessMessage('User updated successfully');

      setIsModalOpen(false);
      resetForm();
      fetchUsers();
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to update user');
    }
  };

  const handleEdit = (user: TenantUser) => {
    setIsEditing(true);
    setEditingUser(user);
    setEditFormData({
      role: user.role,
      is_active: user.tenant_is_active,
      branch_id: user.branch_id || undefined,
      full_name: user.full_name,
      email: user.email,
    });
    setIsModalOpen(true);
  };

  const handleDeleteClick = (user: TenantUser) => {
    setUserToDelete({ id: user.id, name: user.full_name, email: user.email });
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async (userId: number) => {
    if (!token || !userToDelete) return;

    setErrorMessage('');
    setSuccessMessage('');

    try {
      await api.removeUserFromTenant(token, userId);
      setDeleteModalOpen(false);
      setUserToDelete(null);
      setSuccessMessage(`User "${userToDelete.name}" removed successfully`);
      await fetchUsers();
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error: any) {
      // Error will be handled by the modal
      throw error;
    }
  };

  const openResetPasswordModal = (user: TenantUser) => {
    setResetPasswordUser(user);
    setNewPassword('');
    setConfirmPassword('');
    setShowResetPasswordModal(true);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!resetPasswordUser) return;

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters');
      return;
    }

    try {
      await api.resetUserPassword(token!, resetPasswordUser.id, newPassword);
      setSuccessMessage(`Password reset successfully for ${resetPasswordUser.full_name}`);
      setShowResetPasswordModal(false);
      setNewPassword('');
      setConfirmPassword('');
      setResetPasswordUser(null);
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to reset password');
    }
  };

  const resetForm = () => {
    setAddFormData({
      email: '',
      full_name: '',
      password: '',
      role: 'staff',
      branch_id: undefined,
    });
    setFormData({
      email: '',
      full_name: '',
      role: 'staff',
      branch_id: undefined,
    });
    setEditFormData({
      role: 'staff',
      is_active: true,
      branch_id: undefined,
      full_name: '',
      email: '',
    });
    setIsEditing(false);
    setEditingUser(null);
    setModalMode('add');
  };

  const openAddModal = () => {
    resetForm();
    setModalMode('add');
    setIsModalOpen(true);
  };

  const openInviteModal = () => {
    resetForm();
    setModalMode('invite');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Members</h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage users and their roles in your organization
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={openAddModal}>
            <Plus className="h-4 w-4 mr-2" />
            Add User
          </Button>
          <Button onClick={openInviteModal} variant="secondary">
            <UserPlus className="h-4 w-4 mr-2" />
            Invite User
          </Button>
        </div>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-800">{successMessage}</p>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">{errorMessage}</p>
        </div>
      )}

      {/* Users List */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <p className="mt-2 text-gray-600">Loading team members...</p>
        </div>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <UsersIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No team members yet</h3>
            <p className="text-gray-600 mb-4">
              Add your first team member to get started
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={openAddModal}>
                <Plus className="h-4 w-4 mr-2" />
                Add User
              </Button>
              <Button onClick={openInviteModal} variant="secondary">
                <UserPlus className="h-4 w-4 mr-2" />
                Invite User
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop Table View */}
          <Card className="hidden lg:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                      {branches.length > 0 && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Branch
                        </th>
                      )}
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Joined
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users
                      .sort((a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime())
                      .map((user) => {
                        const isCurrentUser = currentUser?.id === user.id;
                        return (
                          <tr key={user.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                                  <span className="text-primary-700 font-medium text-sm">
                                    {user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                  </span>
                                </div>
                                <div className="ml-4">
                                  <div className="text-sm font-medium text-gray-900">
                                    {user.full_name}
                                    {isCurrentUser && (
                                      <span className="ml-2 text-xs text-gray-500">(You)</span>
                                    )}
                                  </div>
                                  <div className="text-sm text-gray-500">@{user.username}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{user.email}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Badge variant={user.role === 'admin' ? 'warning' : 'default'}>
                                {user.role.toUpperCase()}
                              </Badge>
                            </td>
                            {branches.length > 0 && (
                              <td className="px-6 py-4 whitespace-nowrap">
                                {user.branch_name ? (
                                  <div className="flex items-center gap-1.5 text-sm text-gray-700">
                                    <MapPin className="h-3.5 w-3.5 text-gray-400" />
                                    <span>{user.branch_name}</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 text-sm text-gray-700">
                                    <MapPin className="h-3.5 w-3.5 text-gray-400" />
                                    <span>{tenant?.name || 'Main Location'}</span>
                                    <Badge variant="info" className="ml-1">Main</Badge>
                                  </div>
                                )}
                              </td>
                            )}
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Badge variant={user.tenant_is_active && user.is_active ? 'success' : 'secondary'}>
                                {user.tenant_is_active && user.is_active ? 'Active' : 'Inactive'}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {new Date(user.joined_at).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEdit(user)}
                                  className="text-primary-600 hover:text-primary-900"
                                  disabled={isCurrentUser}
                                  title={isCurrentUser ? "Cannot edit your own role" : "Edit user"}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openResetPasswordModal(user)}
                                  className="text-orange-600 hover:text-orange-900"
                                  title="Reset password"
                                >
                                  <Key className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteClick(user)}
                                  className="text-red-600 hover:text-red-900"
                                  disabled={isCurrentUser}
                                  title={isCurrentUser ? "Cannot remove yourself" : "Remove user"}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Mobile Card View */}
          <div className="lg:hidden space-y-4">
            {users
              .sort((a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime())
              .map((user) => {
                const isCurrentUser = currentUser?.id === user.id;
                return (
                  <Card key={user.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="flex-shrink-0 h-12 w-12 rounded-full bg-primary-100 flex items-center justify-center">
                          <span className="text-primary-700 font-medium">
                            {user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </span>
                        </div>
                        <div className="flex-1 flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <h3 className="font-semibold text-gray-900 text-base truncate">
                                {user.full_name}
                                {isCurrentUser && (
                                  <span className="ml-2 text-xs text-gray-500">(You)</span>
                                )}
                              </h3>
                              <Badge variant={user.role === 'admin' ? 'warning' : 'default'} className="text-xs">
                                {user.role.toUpperCase()}
                              </Badge>
                            </div>
                            <div className="space-y-0.5">
                              <p className="text-sm text-gray-600 truncate">{user.email}</p>
                              <p className="text-xs text-gray-500">@{user.username}</p>
                            </div>
                          </div>
                          <Badge variant={user.tenant_is_active && user.is_active ? 'success' : 'secondary'} className="ml-2 flex-shrink-0">
                            {user.tenant_is_active && user.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                        {branches.length > 0 && (
                          <div>
                            <p className="text-gray-600 text-xs">Branch</p>
                            {user.branch_name ? (
                              <div className="flex items-center gap-1 mt-0.5">
                                <MapPin className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                <p className="font-medium text-gray-900 text-sm truncate">{user.branch_name}</p>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 mt-0.5">
                                <MapPin className="h-3 w-3 text-gray-400 flex-shrink-0" />
                                <p className="font-medium text-gray-900 text-sm truncate">{tenant?.name || 'Main Location'}</p>
                                <Badge variant="info" className="text-xs ml-1">Main</Badge>
                              </div>
                            )}
                          </div>
                        )}
                        <div>
                          <p className="text-gray-600 text-xs">Joined</p>
                          <p className="font-medium text-gray-900 text-sm mt-0.5">
                            {new Date(user.joined_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-gray-200 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(user)}
                          className="flex-1"
                          disabled={isCurrentUser}
                          title={isCurrentUser ? "Cannot edit your own role" : "Edit user"}
                        >
                          <Edit2 className="h-4 w-4 mr-2" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openResetPasswordModal(user)}
                          className="flex-1"
                          title="Reset password"
                        >
                          <Key className="h-4 w-4 mr-2" />
                          Reset
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteClick(user)}
                          className="flex-1"
                          disabled={isCurrentUser}
                          title={isCurrentUser ? "Cannot remove yourself" : "Remove user"}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Remove
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        </>
      )}

      {/* Invite/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">
                {isEditing ? 'Edit User' : modalMode === 'add' ? 'Add User' : 'Invite User'}
              </h2>

              <form onSubmit={isEditing ? handleUpdateSubmit : modalMode === 'add' ? handleAddSubmit : handleInviteSubmit} className="space-y-4">
                {!isEditing ? (
                  <>
                    {modalMode === 'add' ? (
                      <>
                        {/* Add User Form */}
                        {/* Email */}
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-700">
                            Email <span className="text-red-500">*</span>
                          </label>
                          <Input
                            type="email"
                            required
                            value={addFormData.email}
                            onChange={(e) => setAddFormData({ ...addFormData, email: e.target.value })}
                            placeholder="user@example.com"
                          />
                          <p className="text-xs text-gray-500">
                            Used for login
                          </p>
                        </div>

                        {/* Full Name */}
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-700">
                            Full Name <span className="text-red-500">*</span>
                          </label>
                          <Input
                            required
                            value={addFormData.full_name}
                            onChange={(e) => setAddFormData({ ...addFormData, full_name: e.target.value })}
                            placeholder="e.g., John Doe"
                            maxLength={100}
                          />
                        </div>

                        {/* Password */}
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-700">
                            Password <span className="text-red-500">*</span>
                          </label>
                          <Input
                            type="password"
                            required
                            value={addFormData.password}
                            onChange={(e) => setAddFormData({ ...addFormData, password: e.target.value })}
                            placeholder="••••••••"
                            minLength={6}
                          />
                          <p className="text-xs text-gray-500">
                            Minimum 6 characters
                          </p>
                        </div>

                        {/* Role */}
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-700">
                            Role <span className="text-red-500">*</span>
                          </label>
                          <select
                            required
                            value={addFormData.role}
                            onChange={(e) => setAddFormData({ ...addFormData, role: e.target.value as 'admin' | 'staff' })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          >
                            <option value="staff">Staff</option>
                            <option value="admin">Admin</option>
                          </select>
                          <p className="text-xs text-gray-500">
                            Admins can manage users and settings
                          </p>
                        </div>

                        {/* Branch Assignment (only if branches exist) */}
                        {branches.length > 0 && (
                          <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">
                              Branch Assignment
                            </label>
                            <select
                              value={addFormData.branch_id || ''}
                              onChange={(e) => setAddFormData({ ...addFormData, branch_id: e.target.value ? parseInt(e.target.value) : undefined })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                              disabled={isLoadingBranches}
                            >
                              <option value="">Main Location ({tenant?.name})</option>
                              {branches
                                .filter(branch => branch.id !== tenant?.id)
                                .map((branch) => (
                                  <option key={branch.id} value={branch.id}>
                                    {branch.name}
                                  </option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500">
                              Defaults to main location if not specified
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {/* Invite User Form */}
                        {/* Email */}
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-700">
                            Email <span className="text-red-500">*</span>
                          </label>
                          <Input
                            type="email"
                            required
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            placeholder="user@example.com"
                          />
                          <p className="text-xs text-gray-500">
                            An invitation email will be sent with login credentials
                          </p>
                        </div>

                        {/* Full Name */}
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-700">
                            Full Name <span className="text-red-500">*</span>
                          </label>
                          <Input
                            required
                            value={formData.full_name}
                            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                            placeholder="e.g., John Doe"
                            maxLength={100}
                          />
                        </div>

                        {/* Role */}
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-700">
                            Role <span className="text-red-500">*</span>
                          </label>
                          <select
                            required
                            value={formData.role}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'staff' })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          >
                            <option value="staff">Staff</option>
                            <option value="admin">Admin</option>
                          </select>
                          <p className="text-xs text-gray-500">
                            Admins can manage users and settings
                          </p>
                        </div>

                        {/* Branch Assignment (only if branches exist) */}
                        {branches.length > 0 && (
                          <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">
                              Branch Assignment
                            </label>
                            <select
                              value={formData.branch_id || ''}
                              onChange={(e) => setFormData({ ...formData, branch_id: e.target.value ? parseInt(e.target.value) : undefined })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                              disabled={isLoadingBranches}
                            >
                              <option value="">Main Location ({tenant?.name})</option>
                              {branches
                                .filter(branch => branch.id !== tenant?.id)
                                .map((branch) => (
                                  <option key={branch.id} value={branch.id}>
                                    {branch.name}
                                  </option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500">
                              Defaults to main location if not specified
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {/* User avatar */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex-shrink-0 h-12 w-12 rounded-full bg-primary-100 flex items-center justify-center">
                        <span className="text-primary-700 font-medium">
                          {(editFormData.full_name || editingUser?.full_name || '').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500">@{editingUser?.username}</div>
                    </div>

                    {/* Full Name */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <Input
                        required
                        value={editFormData.full_name || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })}
                        placeholder="e.g., John Doe"
                        maxLength={100}
                      />
                    </div>

                    {/* Email */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Email <span className="text-red-500">*</span>
                      </label>
                      <Input
                        type="email"
                        required
                        value={editFormData.email || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                        placeholder="user@example.com"
                      />
                    </div>

                    {/* Role */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Role <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={editFormData.role}
                        onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value as 'admin' | 'staff' })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      >
                        <option value="staff">Staff</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>

                    {/* Branch Assignment (only if branches exist) */}
                    {branches.length > 0 && (
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Branch Assignment
                        </label>
                        <select
                          value={editFormData.branch_id || 0}
                          onChange={(e) => {
                            const value = parseInt(e.target.value);
                            setEditFormData({ ...editFormData, branch_id: value });
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          disabled={isLoadingBranches}
                        >
                          <option value={0}>Main Location ({tenant?.name})</option>
                          {branches
                            .filter(branch => branch.id !== tenant?.id)
                            .map((branch) => (
                              <option key={branch.id} value={branch.id}>
                                {branch.name}
                              </option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500">
                          Staff will only transact in their assigned branch
                        </p>
                      </div>
                    )}

                    {/* Active Status */}
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is_active"
                        checked={editFormData.is_active}
                        onChange={(e) => setEditFormData({ ...editFormData, is_active: e.target.checked })}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <label htmlFor="is_active" className="text-sm text-gray-700">
                        Active (can access the system)
                      </label>
                    </div>
                  </>
                )}

                {/* Form Actions */}
                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={closeModal} className="flex-1">
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1">
                    {isEditing ? 'Update' : modalMode === 'add' ? 'Add User' : 'Send Invitation'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetPasswordModal && resetPasswordUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">Reset Password</h2>
              <p className="text-sm text-gray-600 mb-4">
                Reset password for <strong>{resetPasswordUser.full_name}</strong> ({resetPasswordUser.email})
              </p>

              <form onSubmit={handleResetPassword} className="space-y-4">
                {/* New Password */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    New Password <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    minLength={6}
                  />
                  <p className="text-xs text-gray-500">Minimum 6 characters</p>
                </div>

                {/* Confirm Password */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Confirm Password <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    minLength={6}
                  />
                </div>

                {/* Form Actions */}
                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowResetPasswordModal(false);
                      setNewPassword('');
                      setConfirmPassword('');
                      setResetPasswordUser(null);
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1">
                    Reset Password
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Modal */}
      {deleteModalOpen && userToDelete && token && (
        <DeleteUserModal
          isOpen={deleteModalOpen}
          userName={userToDelete.name}
          userEmail={userToDelete.email}
          userId={userToDelete.id}
          token={token}
          onClose={() => {
            setDeleteModalOpen(false);
            setUserToDelete(null);
          }}
          onDelete={handleDeleteConfirm}
        />
      )}
    </div>
  );
}
