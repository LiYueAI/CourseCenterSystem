'use client';

import { useEffect, useState } from 'react';
import {
  Copy,
  Loader2,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCcw,
  School,
  Trash2,
  Users,
} from 'lucide-react';
import AdminPageHeader from '@/components/manage/AdminPageHeader';
import ClassroomMembershipManager from '@/components/manage/ClassroomMembershipManager';

type ClassroomRecord = {
  id: number;
  schoolName: string;
  gradeLevel: string;
  className: string;
  classCode: string;
  classCodeEnabled: boolean;
  classCodeStatus: 'enabled' | 'disabled';
  teacherCount: number;
  studentCount: number;
  teachers: Array<{
    userId: string;
    name: string;
  }>;
};

type ClassroomFormState = {
  schoolName: string;
  gradeLevel: string;
  className: string;
};

const emptyClassroomForm: ClassroomFormState = {
  schoolName: '',
  gradeLevel: '',
  className: '',
};

export default function ManageClassroomsPageClient() {
  const [classrooms, setClassrooms] = useState<ClassroomRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingClassroom, setEditingClassroom] = useState<ClassroomRecord | null>(null);
  const [classroomForm, setClassroomForm] = useState<ClassroomFormState>(emptyClassroomForm);
  const [saving, setSaving] = useState(false);
  const [actionClassroomId, setActionClassroomId] = useState<number | null>(null);

  useEffect(() => {
    void loadClassrooms();
  }, []);

  async function loadClassrooms() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/classrooms', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('获取班级列表失败');
      }

      const payload = (await response.json()) as { classrooms?: ClassroomRecord[] };
      setClassrooms(payload.classrooms || []);
    } catch (loadError) {
      console.error('Failed to load classrooms', loadError);
      setError(loadError instanceof Error ? loadError.message : '获取班级列表失败');
    } finally {
      setLoading(false);
    }
  }

  function openCreateModal() {
    setEditingClassroom(null);
    setClassroomForm(emptyClassroomForm);
    setError(null);
    setFeedback(null);
    setShowModal(true);
  }

  function openEditModal(classroom: ClassroomRecord) {
    setEditingClassroom(classroom);
    setClassroomForm({
      schoolName: classroom.schoolName,
      gradeLevel: classroom.gradeLevel,
      className: classroom.className,
    });
    setError(null);
    setFeedback(null);
    setShowModal(true);
  }

  function closeModal() {
    if (saving) {
      return;
    }

    setShowModal(false);
    setEditingClassroom(null);
    setClassroomForm(emptyClassroomForm);
  }

  async function handleSubmitClassroom(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch('/api/admin/classrooms', {
        method: editingClassroom ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingClassroom ? { classroomId: editingClassroom.id } : {}),
          ...classroomForm,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || (editingClassroom ? '更新班级失败' : '创建班级失败'));
      }

      setFeedback(editingClassroom ? '班级信息已更新。' : '班级已创建。');
      await loadClassrooms();
      closeModal();
    } catch (saveError) {
      console.error('Failed to save classroom', saveError);
      setError(saveError instanceof Error ? saveError.message : '保存班级失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleCodeAction(classroomId: number, action: 'rotateClassCode' | 'disableClassCode' | 'enableClassCode') {
    setActionClassroomId(classroomId);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch('/api/admin/classrooms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classroomId, action }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || '班级编码操作失败');
      }

      setFeedback(
        action === 'rotateClassCode'
          ? '班级编码已轮换。'
          : action === 'disableClassCode'
            ? '班级编码已停用。'
            : '班级编码已重新启用。'
      );
      await loadClassrooms();
    } catch (actionError) {
      console.error('Failed to update classroom code', actionError);
      setError(actionError instanceof Error ? actionError.message : '班级编码操作失败');
    } finally {
      setActionClassroomId(null);
    }
  }

  async function handleDeleteClassroom(classroom: ClassroomRecord) {
    const confirmed = window.confirm(
      `确定删除班级“${classroom.schoolName} · ${classroom.gradeLevel} · ${classroom.className}”吗？`
    );

    if (!confirmed) {
      return;
    }

    setActionClassroomId(classroom.id);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch('/api/admin/classrooms', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classroomId: classroom.id }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || '删除班级失败');
      }

      setFeedback('班级已删除。');
      setClassrooms((current) => current.filter((item) => item.id !== classroom.id));
    } catch (deleteError) {
      console.error('Failed to delete classroom', deleteError);
      setError(deleteError instanceof Error ? deleteError.message : '删除班级失败');
    } finally {
      setActionClassroomId(null);
    }
  }

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="班级管理"
        backHref="/manage"
        backLabel="返回管理首页"
        actions={
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-5 py-3 text-sm font-medium text-[#f8ead1] shadow-[0_14px_30px_rgba(127,23,18,0.2)]"
          >
            <Plus className="h-5 w-5" />
            新建班级
          </button>
        }
      />

      {feedback ? (
        <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/90 px-5 py-4 text-sm text-emerald-700">
          {feedback}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[24px] border border-rose-200 bg-rose-50/90 px-5 py-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="portal-panel overflow-hidden">
        <div className="border-b border-[#d9c29b]/45 bg-[linear-gradient(180deg,rgba(255,251,244,0.94),rgba(247,238,224,0.92))] px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm tracking-[0.22em] text-stone-600">班级列表</div>
            <button
              type="button"
              onClick={() => void loadClassrooms()}
              className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/55 bg-white/88 px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017]"
            >
              <RefreshCcw className="h-4 w-4" />
              刷新
            </button>
          </div>
        </div>

        <div className="divide-y divide-[#eadfce]">
          {loading ? (
            <div className="px-6 py-16 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#8f2017]" />
              <p className="mt-3 text-stone-500">正在加载班级数据...</p>
            </div>
          ) : classrooms.length > 0 ? (
            classrooms.map((classroom) => {
              const isActing = actionClassroomId === classroom.id;
              const classCodeEnabled =
                typeof classroom.classCodeEnabled === 'boolean'
                  ? classroom.classCodeEnabled
                  : classroom.classCodeStatus !== 'disabled';

              return (
                <div key={classroom.id} className="px-6 py-5">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#d9c29b]/55 bg-[linear-gradient(180deg,#fff8eb,#f4e2be)] text-[#8f2017]">
                          <School className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-lg font-semibold text-stone-900">
                            {classroom.gradeLevel} · {classroom.className}
                          </div>
                          <div className="mt-1 text-sm text-stone-500">{classroom.schoolName}</div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <div className="rounded-full border border-[#d9c29b]/55 bg-[#fff8eb] px-4 py-2 text-sm tracking-[0.18em] text-[#8f2017]">
                          班级编码 {classroom.classCode}
                        </div>
                        <div
                          className={`rounded-full border px-4 py-2 text-sm tracking-[0.16em] ${
                            classCodeEnabled
                              ? 'border-emerald-200 bg-emerald-50/90 text-emerald-700'
                              : 'border-stone-300 bg-stone-100/90 text-stone-600'
                          }`}
                        >
                          当前状态 {classCodeEnabled ? '启用中' : '已停用'}
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/55 bg-white/82 px-4 py-2 text-sm text-stone-600">
                          <Users className="h-4 w-4" />
                          {classroom.teacherCount} 位老师
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/55 bg-white/82 px-4 py-2 text-sm text-stone-600">
                          <Users className="h-4 w-4" />
                          {classroom.studentCount} 名学生
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          disabled={isActing}
                          onClick={() => openEditModal(classroom)}
                          className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/55 bg-white/88 px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017] disabled:opacity-60"
                        >
                          <Pencil className="h-4 w-4" />
                          编辑班级
                        </button>
                        <button
                          type="button"
                          disabled={isActing}
                          onClick={() => void handleCodeAction(classroom.id, 'rotateClassCode')}
                          className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/55 bg-white/88 px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017] disabled:opacity-60"
                        >
                          {isActing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                          轮换编码
                        </button>
                        <button
                          type="button"
                          disabled={isActing}
                          onClick={() =>
                            void handleCodeAction(
                              classroom.id,
                              classCodeEnabled ? 'disableClassCode' : 'enableClassCode'
                            )
                          }
                          className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/55 bg-[#fff8eb] px-4 py-2 text-sm font-medium text-[#8f2017] transition-colors hover:border-[#c58d3e] hover:bg-white disabled:opacity-60"
                        >
                          {classCodeEnabled ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                          {classCodeEnabled ? '停用编码' : '重新启用'}
                        </button>
                        <button
                          type="button"
                          disabled={isActing}
                          onClick={() => void handleDeleteClassroom(classroom)}
                          className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 disabled:opacity-60"
                        >
                          {isActing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          删除班级
                        </button>
                      </div>
                    </div>

                    <div className="w-full max-w-sm rounded-[24px] border border-[#d9c29b]/45 bg-white/82 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
                        <Copy className="h-4 w-4 text-[#8f2017]" />
                        当前老师
                      </div>
                      <div className="mt-3 space-y-2 text-sm text-stone-600">
                        {classroom.teachers.length > 0 ? (
                          classroom.teachers.map((teacher) => (
                            <div
                              key={teacher.userId}
                              className="rounded-2xl border border-[#d9c29b]/40 bg-[#fffaf0] px-4 py-2.5"
                            >
                              {teacher.name}
                            </div>
                          ))
                        ) : (
                          <div className="rounded-2xl border border-dashed border-[#d9c29b]/55 bg-[#fffaf0] px-4 py-4 text-stone-500">
                            当前还没有老师归属到这个班级。
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-6 py-12 text-center text-stone-500">当前还没有班级数据。</div>
          )}
        </div>
      </section>

      <ClassroomMembershipManager />

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,23,16,0.52)] p-4">
          <div className="portal-panel w-full max-w-md p-6">
            <h3 className="portal-title mb-4 text-2xl font-semibold text-stone-900">
              {editingClassroom ? '编辑班级' : '新建班级'}
            </h3>

            <form onSubmit={handleSubmitClassroom} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">学校 *</label>
                <input
                  type="text"
                  value={classroomForm.schoolName}
                  onChange={(event) =>
                    setClassroomForm((current) => ({ ...current, schoolName: event.target.value }))
                  }
                  required
                  className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">年级 *</label>
                <input
                  type="text"
                  value={classroomForm.gradeLevel}
                  onChange={(event) =>
                    setClassroomForm((current) => ({ ...current, gradeLevel: event.target.value }))
                  }
                  required
                  className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">班级 *</label>
                <input
                  type="text"
                  value={classroomForm.className}
                  onChange={(event) =>
                    setClassroomForm((current) => ({ ...current, className: event.target.value }))
                  }
                  required
                  className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 rounded-full border border-[#d9c29b]/55 bg-white/80 px-4 py-3 text-sm font-medium text-stone-700 transition-colors hover:border-[#b83226]/25"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-4 py-3 text-sm font-medium text-[#f8ead1] shadow-[0_14px_30px_rgba(127,23,18,0.2)] disabled:opacity-50"
                >
                  {saving ? '保存中...' : editingClassroom ? '保存' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
