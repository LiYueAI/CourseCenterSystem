'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

type ClassroomRecord = {
  id: number;
  schoolName: string;
  gradeLevel: string;
  className: string;
  classCode: string;
  teacherCount: number;
  studentCount: number;
};

type StudentMembership = {
  userId: string;
  name: string;
  schoolName: string;
  gradeLevel: string;
  className: string;
  classCode: string;
};

type TeacherMembership = {
  userId: string;
  name: string;
  subject: string | null;
  schoolName: string;
  gradeLevel: string;
  className: string;
  classCode: string;
};

type MembershipPayload = {
  classrooms: ClassroomRecord[];
  students: StudentMembership[];
  teachers: TeacherMembership[];
};

type SavingKey = string | null;

function formatClassroomLabel(item: {
  schoolName: string;
  gradeLevel: string;
  className: string;
  classCode: string;
}) {
  return `${item.schoolName} · ${item.gradeLevel}${item.className} · ${item.classCode}`;
}

export default function ClassroomMembershipManager() {
  const [classrooms, setClassrooms] = useState<ClassroomRecord[]>([]);
  const [students, setStudents] = useState<StudentMembership[]>([]);
  const [teachers, setTeachers] = useState<TeacherMembership[]>([]);
  const [studentSelections, setStudentSelections] = useState<Record<string, string>>({});
  const [teacherSelections, setTeacherSelections] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<SavingKey>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [classroomResponse, membershipResponse] = await Promise.all([
        fetch('/api/admin/classrooms', { cache: 'no-store' }),
        fetch('/api/admin/classroom-memberships', { cache: 'no-store' }),
      ]);

      if (!classroomResponse.ok || !membershipResponse.ok) {
        throw new Error('管理数据读取失败');
      }

      const classroomPayload = (await classroomResponse.json()) as {
        classrooms?: ClassroomRecord[];
      };
      const membershipPayload = (await membershipResponse.json()) as {
        students?: StudentMembership[];
        teachers?: TeacherMembership[];
      };

      const nextClassrooms = classroomPayload.classrooms || [];
      const nextStudents = membershipPayload.students || [];
      const nextTeachers = membershipPayload.teachers || [];

      setClassrooms(nextClassrooms);
      setStudents(nextStudents);
      setTeachers(nextTeachers);
      setStudentSelections(
        Object.fromEntries(nextStudents.map((student) => [student.userId, student.classCode]))
      );
      setTeacherSelections(
        Object.fromEntries(nextTeachers.map((teacher) => [teacher.userId, teacher.classCode]))
      );
    } catch (loadError) {
      console.error('Failed to load classroom membership manager', loadError);
      setError(loadError instanceof Error ? loadError.message : '管理数据读取失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const classroomOptions = useMemo(
    () =>
      classrooms.map((classroom) => ({
        value: classroom.classCode,
        label: formatClassroomLabel(classroom),
      })),
    [classrooms]
  );

  async function updateMembership(params: {
    userId: string;
    classCode: string;
    targetType: 'student' | 'teacher';
  }) {
    setSavingKey(`${params.targetType}:${params.userId}`);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch('/api/admin/classroom-memberships', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const payload = await response.json().catch(() => ({ error: '保存失败' }));
      if (!response.ok) {
        throw new Error(payload.error || '保存失败');
      }

      setFeedback(params.targetType === 'student' ? '学生当前班级已更新' : '老师当前班级已更新');
      await loadData();
    } catch (saveError) {
      console.error('Failed to update classroom membership', saveError);
      setError(saveError instanceof Error ? saveError.message : '保存失败');
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-[#d9c29b]/55 bg-[linear-gradient(180deg,rgba(255,252,246,0.98),rgba(248,239,224,0.98))] p-6 shadow-[0_30px_80px_rgba(45,31,11,0.14)] md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {[
              `班级 ${classrooms.length}`,
              `学生 ${students.length}`,
              `老师 ${teachers.length}`,
            ].map((item) => (
              <div
                key={item}
                className="rounded-full border border-[#d9c29b]/55 bg-white/82 px-4 py-2 text-sm text-stone-600"
              >
                {item}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-2 rounded-full border border-[#d9c29b]/55 bg-white/86 px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-[#c58d3e] hover:text-[#8f2017]"
          >
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>
        </div>

        {feedback ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-700">
            {feedback}
          </div>
        ) : null}

        {error ? (
          <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-8 flex min-h-[260px] items-center justify-center rounded-[28px] border border-[#d9c29b]/45 bg-white/82">
            <div className="text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#8f2017]" />
              <p className="mt-4 text-stone-600">正在读取当前关系</p>
            </div>
          </div>
        ) : (
            <div className="mt-8 space-y-8">
              <div className="rounded-[28px] border border-[#d9c29b]/45 bg-white/82 p-5 md:p-6">
                <div className="text-sm font-semibold text-stone-900">学生</div>
                <div className="mt-4 space-y-4">
                {students.length > 0 ? (
                  students.map((student) => {
                    const rowSavingKey = `student:${student.userId}`;
                    const isSaving = savingKey === rowSavingKey;
                    const nextClassCode = studentSelections[student.userId] || student.classCode;

                    return (
                      <div
                        key={student.userId}
                        className="rounded-[24px] border border-[#d9c29b]/40 bg-[#fffdf8] p-4"
                      >
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                          <div className="min-w-0">
                            <div className="text-lg font-semibold text-stone-900">{student.name}</div>
                            <div className="mt-2 text-sm text-stone-600">
                              当前班级：{student.schoolName} · {student.gradeLevel}{student.className} · {student.classCode}
                            </div>
                          </div>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <select
                              value={nextClassCode}
                              onChange={(event) =>
                                setStudentSelections((current) => ({
                                  ...current,
                                  [student.userId]: event.target.value,
                                }))
                              }
                              className="min-w-[320px] rounded-full border border-[#d9c29b]/55 bg-white px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                            >
                              {classroomOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={isSaving || nextClassCode === student.classCode}
                              onClick={() =>
                                updateMembership({
                                  targetType: 'student',
                                  userId: student.userId,
                                  classCode: nextClassCode,
                                })
                              }
                              className="inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-5 py-3 text-sm font-medium text-[#f8ead1] shadow-[0_14px_30px_rgba(127,23,18,0.2)] disabled:opacity-60"
                            >
                              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              保存调整
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[24px] border border-dashed border-[#d9c29b]/55 bg-[#fffaf0] px-5 py-10 text-center text-sm text-stone-500">
                    当前还没有学生归属关系。
                  </div>
                )}
              </div>
            </div>

              <div className="rounded-[28px] border border-[#d9c29b]/45 bg-white/82 p-5 md:p-6">
                <div className="text-sm font-semibold text-stone-900">老师</div>
                <div className="mt-4 space-y-4">
                {teachers.length > 0 ? (
                  teachers.map((teacher) => {
                    const rowSavingKey = `teacher:${teacher.userId}`;
                    const isSaving = savingKey === rowSavingKey;
                    const nextClassCode = teacherSelections[teacher.userId] || teacher.classCode;

                    return (
                      <div
                        key={teacher.userId}
                        className="rounded-[24px] border border-[#d9c29b]/40 bg-[#fffdf8] p-4"
                      >
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                          <div className="min-w-0">
                            <div className="text-lg font-semibold text-stone-900">
                              {teacher.name}
                              {teacher.subject ? ` · ${teacher.subject}` : ''}
                            </div>
                            <div className="mt-2 text-sm text-stone-600">
                              当前班级：{teacher.schoolName} · {teacher.gradeLevel}{teacher.className} · {teacher.classCode}
                            </div>
                          </div>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <select
                              value={nextClassCode}
                              onChange={(event) =>
                                setTeacherSelections((current) => ({
                                  ...current,
                                  [teacher.userId]: event.target.value,
                                }))
                              }
                              className="min-w-[320px] rounded-full border border-[#d9c29b]/55 bg-white px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                            >
                              {classroomOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={isSaving || nextClassCode === teacher.classCode}
                              onClick={() =>
                                updateMembership({
                                  targetType: 'teacher',
                                  userId: teacher.userId,
                                  classCode: nextClassCode,
                                })
                              }
                              className="inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-5 py-3 text-sm font-medium text-[#f8ead1] shadow-[0_14px_30px_rgba(127,23,18,0.2)] disabled:opacity-60"
                            >
                              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              保存调整
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[24px] border border-dashed border-[#d9c29b]/55 bg-[#fffaf0] px-5 py-10 text-center text-sm text-stone-500">
                    当前还没有老师归属关系。
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
