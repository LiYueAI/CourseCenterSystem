'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import AdminPageHeader from '@/components/manage/AdminPageHeader';

export const dynamic = 'force-dynamic';

type UserRole = 'admin' | 'teacher' | 'student';
type CapabilityScopeLevel = 'platform' | 'school' | 'school_classroom';

interface User {
  id: string;
  email?: string | null;
  phone?: string | null;
  role: UserRole;
  name?: string | null;
  is_active: boolean;
  created_at: string;
  school?: string | null;
  subject?: string | null;
  gradeLevel?: string | null;
  className?: string | null;
  classCode?: string | null;
}

interface UserFormState {
  phone: string;
  email: string;
  password: string;
  role: UserRole;
  name: string;
  class_code: string;
  school: string;
  subject: string;
  class_name: string;
  grade_level: string;
}

interface TeacherCapabilitySnapshotItem {
  id: number;
  key: string;
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  assigned: boolean;
  assignmentId: number | null;
  assignedAt: string | null;
  assignedByUserId: string | null;
  scopeLevel: CapabilityScopeLevel | null;
  schoolId: number | null;
  schoolName: string | null;
  schoolClassroomId: number | null;
  className: string | null;
  classCode: string | null;
}

interface TeacherCapabilityTeacherSummary {
  userId: string;
  name: string;
  subject: string | null;
  school: string | null;
  schoolId: number | null;
  gradeLevel: string | null;
  className: string | null;
  classCode: string | null;
  primarySchoolClassroomId: number | null;
}

interface TeacherCapabilitySnapshot {
  teacher: TeacherCapabilityTeacherSummary;
  capabilities: TeacherCapabilitySnapshotItem[];
}

const roleLabels: Record<UserRole, { label: string; color: string }> = {
  admin: { label: '管理员', color: 'bg-stone-100 text-stone-700' },
  teacher: { label: '教师', color: 'bg-sky-100 text-sky-700' },
  student: { label: '学生', color: 'bg-emerald-100 text-emerald-700' },
};

const emptyUserForm: UserFormState = {
  phone: '',
  email: '',
  password: '',
  role: 'teacher',
  name: '',
  class_code: '',
  school: '',
  subject: '',
  class_name: '',
  grade_level: '',
};

function formatDate(value?: string | null): string {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-CN');
}

function buildScopeDescription(item: TeacherCapabilitySnapshotItem): string {
  if (!item.scopeLevel) {
    return '未设置范围';
  }

  if (item.scopeLevel === 'platform') {
    return '全平台';
  }

  if (item.scopeLevel === 'school') {
    return item.schoolName ? `学校：${item.schoolName}` : '当前学校';
  }

  const classLabel = [item.schoolName, item.className].filter(Boolean).join(' / ');
  return classLabel || (item.classCode ? `班级编码：${item.classCode}` : '当前班级');
}

function buildUserClassroomSummary(user: User): string | null {
  if (user.role === 'admin') {
    return null;
  }

  const parts = [user.school, user.gradeLevel, user.className].filter(Boolean);
  const summary = parts.join(' · ');

  if (user.classCode) {
    return summary ? `${summary} · ${user.classCode}` : user.classCode;
  }

  return summary || null;
}

function toUserForm(user: User): UserFormState {
  return {
    phone: user.phone || '',
    email: user.email || '',
    password: '',
    role: user.role,
    name: user.name || '',
    class_code: user.classCode || '',
    school: user.school || '',
    subject: user.subject || '',
    class_name: user.className || '',
    grade_level: user.gradeLevel || '',
  };
}

export default function ManageUsersPageClient() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [savingUser, setSavingUser] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [userForm, setUserForm] = useState<UserFormState>(emptyUserForm);

  const [showCapabilityModal, setShowCapabilityModal] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<User | null>(null);
  const [capabilitySnapshot, setCapabilitySnapshot] = useState<TeacherCapabilitySnapshot | null>(null);
  const [capabilityLoading, setCapabilityLoading] = useState(false);
  const [capabilitySaving, setCapabilitySaving] = useState(false);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [selectedCapabilityKey, setSelectedCapabilityKey] = useState('');
  const [selectedScopeLevel, setSelectedScopeLevel] = useState<CapabilityScopeLevel>('platform');

  useEffect(() => {
    void fetchUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return users.filter((user) => {
      if (!query) {
        return true;
      }

      return (
        (user.name || '').toLowerCase().includes(query) ||
        (user.phone || '').toLowerCase().includes(query) ||
        (user.email || '').toLowerCase().includes(query) ||
        (user.school || '').toLowerCase().includes(query) ||
        (user.classCode || '').toLowerCase().includes(query)
      );
    });
  }, [searchQuery, users]);

  const unassignedCapabilities = useMemo(
    () => (capabilitySnapshot?.capabilities || []).filter((item) => !item.assigned && item.isActive),
    [capabilitySnapshot]
  );

  useEffect(() => {
    if (!unassignedCapabilities.length) {
      setSelectedCapabilityKey('');
      return;
    }

    setSelectedCapabilityKey((current) => {
      if (current && unassignedCapabilities.some((item) => item.key === current)) {
        return current;
      }

      return unassignedCapabilities[0]?.key || '';
    });
  }, [unassignedCapabilities]);

  async function fetchUsers() {
    setLoading(true);
    setUserError(null);

    try {
      const response = await fetch('/api/admin/users', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('获取用户失败');
      }

      const payload = (await response.json()) as { users: User[] };
      setUsers(payload.users || []);
    } catch (error) {
      console.error('Failed to fetch users', error);
      setUserError('获取用户失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }

  function openCreateUserModal() {
    setEditingUser(null);
    setUserForm(emptyUserForm);
    setUserError(null);
    setShowUserModal(true);
  }

  function openEditUserModal(user: User) {
    setEditingUser(user);
    setUserForm(toUserForm(user));
    setUserError(null);
    setShowUserModal(true);
  }

  function closeUserModal() {
    if (savingUser) {
      return;
    }

    setShowUserModal(false);
    setEditingUser(null);
    setUserForm(emptyUserForm);
    setUserError(null);
  }

  function updateUserForm<K extends keyof UserFormState>(key: K, value: UserFormState[K]) {
    setUserForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleToggleActive(userId: string, currentActive: boolean) {
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, is_active: !currentActive }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || '更新用户失败');
      }

      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.id === userId ? { ...user, is_active: !currentActive } : user
        )
      );
    } catch (error: any) {
      console.error('Failed to update user', error);
      alert(error.message || '更新失败，请稍后再试。');
    }
  }

  async function handleSubmitUser(event: React.FormEvent) {
    event.preventDefault();
    setSavingUser(true);
    setUserError(null);

    const isEditing = Boolean(editingUser);

    try {
      const response = await fetch('/api/admin/users', {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingUser ? { id: editingUser.id } : {}),
          ...userForm,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || (isEditing ? '更新失败' : '创建失败'));
      }

      await fetchUsers();
      closeUserModal();
    } catch (error: any) {
      console.error('Failed to save user', error);
      setUserError(error.message || (editingUser ? '更新失败' : '创建失败'));
    } finally {
      setSavingUser(false);
    }
  }

  async function handleDeleteUser(user: User) {
    const confirmed = window.confirm(
      `确定删除用户“${user.name || user.email || user.phone || user.id}”吗？此操作不可撤销。`
    );

    if (!confirmed) {
      return;
    }

    setDeletingUserId(user.id);
    setUserError(null);

    try {
      const response = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || '删除失败');
      }

      setUsers((currentUsers) => currentUsers.filter((item) => item.id !== user.id));
    } catch (error: any) {
      console.error('Failed to delete user', error);
      setUserError(error.message || '删除失败');
    } finally {
      setDeletingUserId(null);
    }
  }

  async function loadTeacherCapabilities(teacher: User) {
    setSelectedTeacher(teacher);
    setShowCapabilityModal(true);
    setCapabilityLoading(true);
    setCapabilityError(null);

    try {
      const response = await fetch(
        `/api/admin/teacher-capabilities?teacherUserId=${encodeURIComponent(teacher.id)}`,
        { cache: 'no-store' }
      );

      const payload = (await response.json().catch(() => ({}))) as TeacherCapabilitySnapshot & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || '获取老师兼职职能失败');
      }

      setCapabilitySnapshot(payload);
      setSelectedScopeLevel('platform');
    } catch (error: any) {
      console.error('Failed to load teacher capabilities', error);
      setCapabilityError(error.message || '获取老师兼职职能失败');
      setCapabilitySnapshot(null);
    } finally {
      setCapabilityLoading(false);
    }
  }

  function closeCapabilityModal() {
    if (capabilitySaving) {
      return;
    }

    setShowCapabilityModal(false);
    setSelectedTeacher(null);
    setCapabilitySnapshot(null);
    setCapabilityError(null);
    setSelectedCapabilityKey('');
    setSelectedScopeLevel('platform');
  }

  async function handleAssignCapability(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedTeacher || !selectedCapabilityKey) {
      return;
    }

    setCapabilitySaving(true);
    setCapabilityError(null);

    try {
      const teacher = capabilitySnapshot?.teacher || null;
      const body = {
        teacherUserId: selectedTeacher.id,
        capabilityKey: selectedCapabilityKey,
        scopeLevel: selectedScopeLevel,
        schoolId: selectedScopeLevel !== 'platform' ? teacher?.schoolId ?? null : null,
        schoolClassroomId:
          selectedScopeLevel === 'school_classroom'
            ? teacher?.primarySchoolClassroomId ?? null
            : null,
      };

      const response = await fetch('/api/admin/teacher-capabilities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        teacher: TeacherCapabilityTeacherSummary;
        capabilities: TeacherCapabilitySnapshotItem[];
      };

      if (!response.ok) {
        throw new Error(payload.error || '创建老师兼职职能失败');
      }

      setCapabilitySnapshot({
        teacher: payload.teacher,
        capabilities: payload.capabilities,
      });
    } catch (error: any) {
      console.error('Failed to assign teacher capability', error);
      setCapabilityError(error.message || '创建老师兼职职能失败');
    } finally {
      setCapabilitySaving(false);
    }
  }

  async function handleRevokeCapability(capabilityKey: string) {
    if (!selectedTeacher) {
      return;
    }

    setCapabilitySaving(true);
    setCapabilityError(null);

    try {
      const response = await fetch('/api/admin/teacher-capabilities', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherUserId: selectedTeacher.id,
          capabilityKey,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        teacher: TeacherCapabilityTeacherSummary;
        capabilities: TeacherCapabilitySnapshotItem[];
      };

      if (!response.ok) {
        throw new Error(payload.error || '撤销老师兼职职能失败');
      }

      setCapabilitySnapshot({
        teacher: payload.teacher,
        capabilities: payload.capabilities,
      });
    } catch (error: any) {
      console.error('Failed to revoke teacher capability', error);
      setCapabilityError(error.message || '撤销老师兼职职能失败');
    } finally {
      setCapabilitySaving(false);
    }
  }

  const teacherSummary = capabilitySnapshot?.teacher || null;
  const availableSchoolScope = Boolean(teacherSummary?.schoolId);
  const availableClassroomScope = Boolean(teacherSummary?.primarySchoolClassroomId);
  const isEditingUser = Boolean(editingUser);
  const isAdminRole = userForm.role === 'admin';
  const requiresClassroomFields = !userForm.class_code.trim();
  const requiresPhoneInput = !isAdminRole && !userForm.email.trim();
  const requiresEmailInput = isAdminRole || (!isAdminRole && !userForm.phone.trim());

  useEffect(() => {
    if (selectedScopeLevel === 'school' && !availableSchoolScope) {
      setSelectedScopeLevel('platform');
    }

    if (selectedScopeLevel === 'school_classroom' && !availableClassroomScope) {
      setSelectedScopeLevel(availableSchoolScope ? 'school' : 'platform');
    }
  }, [availableClassroomScope, availableSchoolScope, selectedScopeLevel]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="用户管理"
        backHref="/manage"
        backLabel="返回管理首页"
        actions={
          <button
            onClick={openCreateUserModal}
            className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-5 py-3 text-sm font-medium text-[#f8ead1] shadow-[0_14px_30px_rgba(127,23,18,0.2)]"
          >
            <Plus className="h-5 w-5" />
            添加用户
          </button>
        }
      >
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            placeholder="搜索用户姓名、手机号、邮箱、学校或班级编码"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full rounded-full border border-[#d9c29b]/55 bg-white/88 py-3 pl-12 pr-4 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
          />
        </div>
      </AdminPageHeader>

      {userError ? (
        <div className="rounded-[24px] border border-rose-200 bg-rose-50/90 px-5 py-4 text-sm text-rose-700">
          {userError}
        </div>
      ) : null}

      <section className="portal-panel overflow-hidden">
        {loading ? (
          <div className="py-24 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#c58d3e]" />
            <p className="mt-3 text-stone-500">加载中...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-24 text-center">
            <Users className="mx-auto mb-4 h-12 w-12 text-stone-300" />
            <p className="text-stone-500">暂无用户</p>
          </div>
        ) : (
          <>
            <div className="border-b border-[#d9c29b]/45 bg-[linear-gradient(180deg,rgba(255,251,244,0.94),rgba(247,238,224,0.92))] px-6 py-4">
              <div className="grid grid-cols-[minmax(0,1.8fr)_120px_120px_160px_320px] gap-4 text-sm font-medium tracking-[0.08em] text-stone-500">
                <div>用户</div>
                <div>角色</div>
                <div>状态</div>
                <div>注册时间</div>
                <div className="text-right">操作</div>
              </div>
            </div>
            <div className="relative">
              <table className="w-full">
                <tbody className="divide-y divide-[#eadbc2]">
                  {filteredUsers.map((user) => {
                    const classroomSummary = buildUserClassroomSummary(user);
                    const isDeleting = deletingUserId === user.id;

                    return (
                      <tr key={user.id} className="transition-colors hover:bg-[rgba(255,250,241,0.72)]">
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-stone-900">{user.name || '未命名用户'}</p>
                            <p className="text-sm text-stone-500">
                              {user.phone || user.email || '未填写联系方式'}
                            </p>
                            {classroomSummary ? (
                              <p className="mt-1 text-xs text-stone-500">{classroomSummary}</p>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              roleLabels[user.role]?.color || 'bg-stone-100 text-stone-700'
                            }`}
                          >
                            {roleLabels[user.role]?.label || user.role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              user.is_active
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-rose-100 text-rose-700'
                            }`}
                          >
                            {user.is_active ? '正常' : '已禁用'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-stone-500">
                          {new Date(user.created_at).toLocaleDateString('zh-CN')}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-3">
                            {user.role === 'teacher' ? (
                              <button
                                onClick={() => void loadTeacherCapabilities(user)}
                                className="inline-flex items-center gap-1 rounded-full border border-[#d9c29b]/55 bg-white/88 px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017]"
                              >
                                <ShieldCheck className="h-4 w-4" />
                                职能
                              </button>
                            ) : null}
                            <button
                              onClick={() => openEditUserModal(user)}
                              className="inline-flex items-center gap-1 rounded-full border border-[#d9c29b]/55 bg-white/88 px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017]"
                            >
                              <Pencil className="h-4 w-4" />
                              编辑
                            </button>
                            <button
                              onClick={() => void handleDeleteUser(user)}
                              disabled={isDeleting}
                              className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 disabled:opacity-60"
                            >
                              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                              删除
                            </button>
                            <button
                              onClick={() => void handleToggleActive(user.id, user.is_active)}
                              className={`text-sm font-medium ${
                                user.is_active
                                  ? 'text-rose-600 hover:text-rose-700'
                                  : 'text-emerald-600 hover:text-emerald-700'
                              }`}
                            >
                              {user.is_active ? '禁用' : '启用'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {showUserModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,23,16,0.52)] p-4">
          <div className="portal-panel max-h-[90vh] w-full max-w-md overflow-y-auto p-6">
            <h3 className="portal-title mb-4 text-2xl font-semibold text-stone-900">
              {isEditingUser ? '编辑用户' : '添加用户'}
            </h3>

            <form onSubmit={handleSubmitUser} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">姓名 *</label>
                <input
                  type="text"
                  value={userForm.name}
                  onChange={(event) => updateUserForm('name', event.target.value)}
                  required
                  className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">
                  手机号 {isAdminRole ? '' : '（手机号或邮箱填一项）'}
                </label>
                <input
                  type="tel"
                  value={userForm.phone}
                  onChange={(event) => updateUserForm('phone', event.target.value)}
                  required={requiresPhoneInput}
                  className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">
                  邮箱{isAdminRole ? ' *' : '（兼容）'}
                </label>
                <input
                  type="email"
                  value={userForm.email}
                  onChange={(event) => updateUserForm('email', event.target.value)}
                  required={requiresEmailInput}
                  className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">
                  {isEditingUser ? '新密码（留空则不修改）' : '密码 *'}
                </label>
                <input
                  type="password"
                  value={userForm.password}
                  onChange={(event) => updateUserForm('password', event.target.value)}
                  required={!isEditingUser}
                  minLength={isEditingUser ? undefined : 6}
                  className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">角色 *</label>
                <select
                  value={userForm.role}
                  disabled={isEditingUser}
                  onChange={(event) =>
                    setUserForm((current) => ({
                      ...current,
                      role: event.target.value as UserRole,
                      class_code: event.target.value === 'admin' ? '' : current.class_code,
                      school: event.target.value === 'admin' ? '' : current.school,
                      subject: event.target.value === 'teacher' ? current.subject : '',
                      class_name: event.target.value === 'admin' ? '' : current.class_name,
                      grade_level: event.target.value === 'admin' ? '' : current.grade_level,
                    }))
                  }
                  className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e] disabled:opacity-60"
                >
                  <option value="teacher">教师</option>
                  <option value="student">学生</option>
                  <option value="admin">管理员</option>
                </select>
                {isEditingUser ? (
                  <p className="mt-1 text-xs text-stone-500">当前版本编辑资料时不支持直接修改角色。</p>
                ) : null}
              </div>

              {userForm.role === 'teacher' || userForm.role === 'student' ? (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-stone-700">班级编码</label>
                    <input
                      type="text"
                      value={userForm.class_code}
                      onChange={(event) => updateUserForm('class_code', event.target.value.toUpperCase())}
                      className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-stone-700">学校 *</label>
                    <input
                      type="text"
                      value={userForm.school}
                      onChange={(event) => updateUserForm('school', event.target.value)}
                      required={requiresClassroomFields}
                      disabled={!requiresClassroomFields}
                      className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e] disabled:opacity-60"
                    />
                  </div>

                  {userForm.role === 'teacher' ? (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-stone-700">
                        学科{isEditingUser ? '' : ' *'}
                      </label>
                      <input
                        type="text"
                        value={userForm.subject}
                        onChange={(event) => updateUserForm('subject', event.target.value)}
                        required={!isEditingUser}
                        className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                      />
                    </div>
                  ) : null}

                  <div>
                    <label className="mb-1 block text-sm font-medium text-stone-700">年级 *</label>
                    <input
                      type="text"
                      value={userForm.grade_level}
                      onChange={(event) => updateUserForm('grade_level', event.target.value)}
                      required={requiresClassroomFields}
                      disabled={!requiresClassroomFields}
                      className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e] disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-stone-700">班级 *</label>
                    <input
                      type="text"
                      value={userForm.class_name}
                      onChange={(event) => updateUserForm('class_name', event.target.value)}
                      required={requiresClassroomFields}
                      disabled={!requiresClassroomFields}
                      className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e] disabled:opacity-60"
                    />
                  </div>
                </>
              ) : null}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeUserModal}
                  className="flex-1 rounded-full border border-[#d9c29b]/55 bg-white/80 px-4 py-3 text-sm font-medium text-stone-700 transition-colors hover:border-[#b83226]/25"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="flex-1 rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-4 py-3 text-sm font-medium text-[#f8ead1] shadow-[0_14px_30px_rgba(127,23,18,0.2)] disabled:opacity-50"
                >
                  {savingUser ? (isEditingUser ? '保存中...' : '创建中...') : isEditingUser ? '保存' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showCapabilityModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,23,16,0.52)] p-4">
          <div className="portal-panel max-h-[90vh] w-full max-w-3xl overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="portal-title text-2xl font-semibold text-stone-900">教师兼职职能</h3>
              </div>
              <button
                type="button"
                onClick={closeCapabilityModal}
                className="rounded-full border border-[#d9c29b]/55 bg-white/80 px-4 py-2 text-sm text-stone-700"
              >
                关闭
              </button>
            </div>

            {capabilityLoading ? (
              <div className="py-20 text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#c58d3e]" />
                <p className="mt-3 text-stone-500">加载老师兼职职能中...</p>
              </div>
            ) : capabilityError ? (
              <div className="mt-6 rounded-[24px] border border-rose-200 bg-rose-50/90 px-5 py-4 text-sm text-rose-700">
                {capabilityError}
              </div>
            ) : capabilitySnapshot ? (
              <div className="mt-6 space-y-6">
                <section className="rounded-[24px] border border-[#d9c29b]/50 bg-white/80 p-5">
                  <div className="text-lg font-semibold text-stone-900">{capabilitySnapshot.teacher.name}</div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-[#eadbc2] bg-[#fffaf2] px-4 py-3 text-sm text-stone-700">
                      主角色：教师
                    </div>
                    <div className="rounded-2xl border border-[#eadbc2] bg-[#fffaf2] px-4 py-3 text-sm text-stone-700">
                      学科：{capabilitySnapshot.teacher.subject || '未填写'}
                    </div>
                    <div className="rounded-2xl border border-[#eadbc2] bg-[#fffaf2] px-4 py-3 text-sm text-stone-700">
                      当前学校：{capabilitySnapshot.teacher.school || '未绑定'}
                    </div>
                    <div className="rounded-2xl border border-[#eadbc2] bg-[#fffaf2] px-4 py-3 text-sm text-stone-700">
                      当前班级：
                      {capabilitySnapshot.teacher.className
                        ? `${capabilitySnapshot.teacher.gradeLevel || ''} ${capabilitySnapshot.teacher.className}`.trim()
                        : '未绑定'}
                    </div>
                  </div>
                </section>

                <section className="rounded-[24px] border border-[#d9c29b]/50 bg-white/80 p-5">
                  <div className="text-lg font-semibold text-stone-900">新增兼职职能</div>
                  <form onSubmit={handleAssignCapability} className="mt-4 grid gap-4 md:grid-cols-[1.2fr_1fr_auto]">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-stone-700">职能</label>
                      <select
                        value={selectedCapabilityKey}
                        onChange={(event) => setSelectedCapabilityKey(event.target.value)}
                        disabled={!unassignedCapabilities.length || capabilitySaving}
                        className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e] disabled:opacity-60"
                      >
                        {unassignedCapabilities.length ? (
                          unassignedCapabilities.map((item) => (
                            <option key={item.key} value={item.key}>
                              {item.name}
                            </option>
                          ))
                        ) : (
                          <option value="">当前无可新增职能</option>
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-stone-700">作用域</label>
                      <select
                        value={selectedScopeLevel}
                        onChange={(event) =>
                          setSelectedScopeLevel(event.target.value as CapabilityScopeLevel)
                        }
                        disabled={capabilitySaving}
                        className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                      >
                        <option value="platform">全平台</option>
                        <option value="school" disabled={!availableSchoolScope}>
                          当前学校
                        </option>
                        <option value="school_classroom" disabled={!availableClassroomScope}>
                          当前班级
                        </option>
                      </select>
                    </div>

                    <div className="flex items-end">
                      <button
                        type="submit"
                        disabled={!selectedCapabilityKey || capabilitySaving}
                        className="w-full rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-5 py-3 text-sm font-medium text-[#f8ead1] shadow-[0_14px_30px_rgba(127,23,18,0.2)] disabled:opacity-50"
                      >
                        {capabilitySaving ? '保存中...' : '添加职能'}
                      </button>
                    </div>
                  </form>
                </section>

                <section className="rounded-[24px] border border-[#d9c29b]/50 bg-white/80 p-5">
                  <div className="text-lg font-semibold text-stone-900">当前职能</div>
                  <div className="mt-4 space-y-3">
                    {capabilitySnapshot.capabilities.filter((item) => item.assigned).length ? (
                      capabilitySnapshot.capabilities
                        .filter((item) => item.assigned)
                        .map((item) => (
                          <div
                            key={item.key}
                            className="rounded-[24px] border border-[#eadbc2] bg-[#fffaf2] px-4 py-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="text-base font-semibold text-stone-900">{item.name}</div>
                                <div className="mt-2 text-xs leading-6 text-stone-500">
                                  范围：{buildScopeDescription(item)}
                                </div>
                                <div className="text-xs leading-6 text-stone-500">
                                  分配时间：{formatDate(item.assignedAt)}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => void handleRevokeCapability(item.key)}
                                disabled={capabilitySaving}
                                className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 disabled:opacity-50"
                              >
                                撤销
                              </button>
                            </div>
                          </div>
                        ))
                    ) : (
                      <div className="rounded-[24px] border border-dashed border-[#d9c29b]/65 bg-white/72 px-5 py-8 text-center text-sm text-stone-500">
                        当前老师还没有兼职业务职能
                      </div>
                    )}
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
