import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  PencilLine,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import {
  listAdminCourses,
  listAdminLessons,
  listAdminModules,
  listAdminUnitsByCourse,
  type AdminCourse,
  type AdminLesson,
  type AdminLessonModule,
  type AdminUnit,
} from "@/lib/directus-admin";
import {
  createCourseAction,
  createLessonAction,
  createModuleAction,
  createUnitAction,
  deleteCourseAction,
  deleteLessonAction,
  deleteModuleAction,
  deleteUnitAction,
  updateCourseAction,
  updateLessonAction,
  updateModuleAction,
  updateUnitAction,
} from "@/app/manage/content/actions";
import ModuleItemsManager from "@/components/content/ModuleItemsManager";
import { listMiniApps } from "@/lib/miniapps";
import type { MiniAppSummary } from "@/lib/miniapps.types";

interface ContentManagementConsoleProps {
  basePath: "/manage/content";
  backHref: "/manage";
  backLabel: string;
  searchParams?: Record<string, string | string[] | undefined>;
}

type QuerySelection = {
  courseId?: number;
  unitId?: number;
  lessonId?: number;
  moduleId?: number;
};

type SelectOption = {
  value: number;
  label: string;
};

function getSingleParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readSelectedId(value: string | string[] | undefined): number | undefined {
  const parsed = Number(getSingleParam(value) || 0);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readMessageParam(value: string | string[] | undefined): string | null {
  const resolved = getSingleParam(value);
  return resolved?.trim() ? resolved.trim() : null;
}

function HiddenSelectionInputs({
  selection,
  keys,
}: {
  selection: QuerySelection;
  keys: Array<keyof QuerySelection>;
}) {
  return (
    <>
      {keys.map((key) => {
        const value = selection[key];
        if (!value) {
          return null;
        }

        return <input key={key} type="hidden" name={key} value={value} />;
      })}
    </>
  );
}

function SelectionCard({
  title,
  step,
  name,
  value,
  placeholder,
  submitLabel,
  options,
  basePath,
  selection,
  preserveKeys,
  children,
}: {
  title: string;
  step: string;
  name: keyof QuerySelection;
  value?: number;
  placeholder: string;
  submitLabel: string;
  options: SelectOption[];
  basePath: string;
  selection: QuerySelection;
  preserveKeys: Array<keyof QuerySelection>;
  children?: React.ReactNode;
}) {
  return (
    <section className="portal-panel p-5">
      <div className="flex items-center gap-2 text-stone-900">
        <Settings2 className="h-5 w-5 text-[#8f2017]" />
        <div>
          <div className="text-xs tracking-[0.18em] text-stone-500">{step}</div>
          <h2 className="text-base font-semibold">{title}</h2>
        </div>
      </div>

      {options.length > 0 ? (
        <form action={basePath} method="get" className="mt-4 space-y-3">
          <HiddenSelectionInputs selection={selection} keys={preserveKeys} />
          <select
            name={name}
            defaultValue={value ? String(value) : ""}
            className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/90 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
          >
            <option value="">{placeholder}</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="w-full rounded-full border border-[#d9c29b]/55 bg-[#fff8eb] px-4 py-2.5 text-sm font-medium text-[#8f2017] transition-colors hover:border-[#c58d3e] hover:bg-white"
          >
            {submitLabel}
          </button>
        </form>
      ) : (
        <div className="mt-4 rounded-[20px] border border-dashed border-[#d9c29b]/60 bg-[rgba(255,250,241,0.75)] px-4 py-5 text-sm text-stone-500">
          当前还没有可选内容。
        </div>
      )}

      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

function InlineDeleteButton({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className="rounded-full border border-rose-200 bg-white/90 px-3 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
    >
      <span className="flex items-center gap-1">
        <Trash2 className="h-4 w-4" />
        {children}
      </span>
    </button>
  );
}

function SelectionSummary({
  activeCourse,
  activeUnit,
  activeLesson,
  activeModule,
}: {
  activeCourse: AdminCourse | null;
  activeUnit: AdminUnit | null;
  activeLesson: AdminLesson | null;
  activeModule: AdminLessonModule | null;
}) {
  if (!activeCourse) {
    return (
      <section className="portal-panel p-5 text-sm text-stone-500">
        先选择课程，再继续选择单元、课时和模块。
      </section>
    );
  }

  const crumbs = [
    activeCourse.title,
    activeUnit?.title,
    activeLesson?.title,
    activeModule?.module_name || activeModule?.module_type,
  ].filter(Boolean) as string[];

  return (
    <section className="portal-panel p-5">
      <div className="text-xs tracking-[0.18em] text-stone-500">当前路径</div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-stone-700">
        {crumbs.map((crumb, index) => (
          <div key={`${crumb}-${index}`} className="flex items-center gap-2">
            {index > 0 ? <ChevronRight className="h-4 w-4 text-stone-400" /> : null}
            <span className="rounded-full border border-[#d9c29b]/55 bg-white/84 px-3 py-1.5">
              {crumb}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function EditorShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-[#d9c29b]/45 bg-white/82 p-6">
      <div className="flex items-center gap-2 text-stone-900">
        <PencilLine className="h-5 w-5 text-[#8f2017]" />
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function CourseEditor({
  course,
  basePath,
}: {
  course: AdminCourse;
  basePath: string;
}) {
  return (
    <EditorShell title="课程信息">
      <form action={updateCourseAction} className="grid gap-4">
        <input type="hidden" name="courseId" value={course.id} />
        <label className="grid gap-2">
          <span className="text-sm font-medium text-stone-700">课程名称</span>
          <input
            name="title"
            defaultValue={course.title}
            className="rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium text-stone-700">状态</span>
          <select
            name="status"
            defaultValue={course.status || "active"}
            className="rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
          >
            <option value="active">启用</option>
            <option value="draft">草稿</option>
            <option value="archived">归档</option>
          </select>
        </label>
        <input type="hidden" name="description" value={course.description || ""} />
        <div className="flex items-center justify-end gap-3">
          <button
            type="submit"
            className="rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-4 py-2.5 text-sm font-medium text-[#f8ead1] shadow-[0_12px_24px_rgba(127,23,18,0.16)]"
          >
            保存课程
          </button>
        </div>
      </form>
      <div className="mt-4 flex justify-end">
        <form action={deleteCourseAction}>
          <input type="hidden" name="courseId" value={course.id} />
          <input type="hidden" name="basePath" value={basePath} />
          <button
            type="submit"
            className="rounded-full border border-rose-200 bg-white/85 px-4 py-2.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
          >
            <span className="flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              删除课程
            </span>
          </button>
        </form>
      </div>
    </EditorShell>
  );
}

function UnitEditor({
  unit,
  courseId,
  basePath,
}: {
  unit: AdminUnit;
  courseId: number;
  basePath: string;
}) {
  return (
    <EditorShell title="单元信息">
      <form action={updateUnitAction}>
        <input type="hidden" name="unitId" value={unit.id} />
        <label className="grid gap-2">
          <span className="text-sm font-medium text-stone-700">单元标题</span>
          <input
            name="title"
            defaultValue={unit.title}
            className="rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
          />
        </label>
        <input type="hidden" name="description" value={unit.description || ""} />
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="submit"
            className="rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-4 py-2.5 text-sm font-medium text-[#f8ead1] shadow-[0_12px_24px_rgba(127,23,18,0.16)]"
          >
            保存单元
          </button>
        </div>
      </form>
      <div className="mt-4 flex justify-end">
        <form action={deleteUnitAction}>
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="unitId" value={unit.id} />
          <input type="hidden" name="basePath" value={basePath} />
          <button
            type="submit"
            className="rounded-full border border-rose-200 bg-white/85 px-4 py-2.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
          >
            <span className="flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              删除单元
            </span>
          </button>
        </form>
      </div>
    </EditorShell>
  );
}

function LessonEditor({
  lesson,
  courseId,
  unitId,
  basePath,
}: {
  lesson: AdminLesson;
  courseId: number;
  unitId: number;
  basePath: string;
}) {
  return (
    <EditorShell title="课时信息">
      <form action={updateLessonAction}>
        <input type="hidden" name="lessonId" value={lesson.id} />
        <label className="grid gap-2">
          <span className="text-sm font-medium text-stone-700">课时标题</span>
          <input
            name="title"
            defaultValue={lesson.title}
            className="rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
          />
        </label>
        <input type="hidden" name="description" value={lesson.description || ""} />
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="submit"
            className="rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-4 py-2.5 text-sm font-medium text-[#f8ead1] shadow-[0_12px_24px_rgba(127,23,18,0.16)]"
          >
            保存课时
          </button>
        </div>
      </form>
      <div className="mt-4 flex justify-end">
        <form action={deleteLessonAction}>
          <input type="hidden" name="courseId" value={courseId} />
          <input type="hidden" name="unitId" value={unitId} />
          <input type="hidden" name="lessonId" value={lesson.id} />
          <input type="hidden" name="basePath" value={basePath} />
          <button
            type="submit"
            className="rounded-full border border-rose-200 bg-white/85 px-4 py-2.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
          >
            <span className="flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              删除课时
            </span>
          </button>
        </form>
      </div>
    </EditorShell>
  );
}

function ModuleEditor({
  module,
  miniApps,
}: {
  module: AdminLessonModule;
  miniApps: MiniAppSummary[];
}) {
  return (
    <section className="portal-panel p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm tracking-[0.16em] text-stone-500">模块内容</div>
          <div className="mt-1 text-lg font-semibold text-stone-900">
            {module.module_name}
          </div>
          <div className="mt-2 text-sm text-stone-500">
            这里只管这个模块里的内容，只保留视频和游戏。
          </div>
        </div>
        <div className="rounded-full border border-[#d9c29b]/55 bg-white/82 px-3 py-1 text-xs font-medium tracking-[0.12em] text-[#8f2017]">
          {(module.items || []).length} 项
        </div>
      </div>

      <div className="mt-5 border-t border-[#d9c29b]/35 pt-5">
        <div className="mb-3 text-sm font-medium tracking-[0.16em] text-stone-600">
          当前内容
        </div>
        <ModuleItemsManager
          moduleId={module.id}
          initialItems={module.items || []}
          miniApps={miniApps}
        />
      </div>
    </section>
  );
}

function CourseCreateForm({ basePath }: { basePath: string }) {
  return (
    <form
      action={createCourseAction}
      className="rounded-[20px] border border-dashed border-[#d9c29b]/70 bg-[rgba(255,250,241,0.75)] p-4"
    >
      <input type="hidden" name="basePath" value={basePath} />
      <label className="grid gap-2">
        <span className="text-xs font-medium tracking-[0.14em] text-stone-500">新增课程</span>
        <input
          name="title"
          placeholder="例如：机器人课程"
          required
          className="rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-3 py-2.5 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
        />
      </label>
      <button
        type="submit"
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-3 py-2.5 text-sm font-medium text-[#f8ead1]"
      >
        <Plus className="h-4 w-4" />
        新增课程
      </button>
    </form>
  );
}

function UnitCreateForm({
  basePath,
  courseId,
}: {
  basePath: string;
  courseId: number;
}) {
  return (
    <form
      action={createUnitAction}
      className="rounded-[20px] border border-dashed border-[#d9c29b]/70 bg-[rgba(255,250,241,0.75)] p-4"
    >
      <input type="hidden" name="basePath" value={basePath} />
      <input type="hidden" name="courseId" value={courseId} />
      <label className="grid gap-2">
        <span className="text-xs font-medium tracking-[0.14em] text-stone-500">新增单元</span>
        <input
          name="title"
          placeholder="输入单元标题"
          required
          className="rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-3 py-2.5 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
        />
      </label>
      <button
        type="submit"
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-3 py-2.5 text-sm font-medium text-[#f8ead1]"
      >
        <Plus className="h-4 w-4" />
        新增单元
      </button>
    </form>
  );
}

function LessonCreateForm({
  basePath,
  courseId,
  unitId,
}: {
  basePath: string;
  courseId: number;
  unitId: number;
}) {
  return (
    <form
      action={createLessonAction}
      className="rounded-[20px] border border-dashed border-[#d9c29b]/70 bg-[rgba(255,250,241,0.75)] p-4"
    >
      <input type="hidden" name="basePath" value={basePath} />
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="unitId" value={unitId} />
      <label className="grid gap-2">
        <span className="text-xs font-medium tracking-[0.14em] text-stone-500">新增课时</span>
        <input
          name="title"
          placeholder="输入课时标题"
          required
          className="rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-3 py-2.5 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
        />
      </label>
      <button
        type="submit"
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-3 py-2.5 text-sm font-medium text-[#f8ead1]"
      >
        <Plus className="h-4 w-4" />
        新增课时
      </button>
    </form>
  );
}

function ModuleCreateForm({
  basePath,
  courseId,
  unitId,
  lessonId,
}: {
  basePath: string;
  courseId: number;
  unitId: number;
  lessonId: number;
}) {
  return (
    <form
      action={createModuleAction}
      className="rounded-[20px] border border-dashed border-[#d9c29b]/70 bg-[rgba(255,250,241,0.75)] p-4"
    >
      <input type="hidden" name="basePath" value={basePath} />
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="unitId" value={unitId} />
      <input type="hidden" name="lessonId" value={lessonId} />
      <div className="grid gap-3">
        <label className="grid gap-2">
          <span className="text-xs font-medium tracking-[0.14em] text-stone-500">新增模块</span>
          <input
            name="module_name"
            defaultValue=""
            placeholder="例如：情景导入、自主探究"
            required
            className="rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-3 py-2.5 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
          />
        </label>
      </div>
      <input type="hidden" name="description" value="" />
      <div className="mt-3 grid gap-3">
        <label className="flex items-center gap-2 rounded-2xl border border-[#d9c29b]/45 bg-white/70 px-4 py-3 text-sm text-stone-700">
          <input
            name="assignment_required"
            type="checkbox"
            className="h-4 w-4 accent-[#8f2017]"
          />
          这是作业节点
        </label>
        <select
          name="unlock_mode"
          defaultValue="sequential"
          className="rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
        >
          <option value="sequential">按顺序解锁</option>
          <option value="free">允许自由进入</option>
        </select>
      </div>
      <button
        type="submit"
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-3 py-2.5 text-sm font-medium text-[#f8ead1]"
      >
        <Plus className="h-4 w-4" />
        新增模块
      </button>
    </form>
  );
}

function InitialCourseSelection({
  basePath,
  courses,
}: {
  basePath: string;
  courses: AdminCourse[];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="portal-panel p-5">
        <div className="flex items-center gap-2 text-stone-900">
          <Settings2 className="h-5 w-5 text-[#8f2017]" />
          <div>
            <div className="text-xs tracking-[0.18em] text-stone-500">课程管理</div>
            <h2 className="text-base font-semibold">选择已有课程</h2>
          </div>
        </div>

        {courses.length > 0 ? (
          <form action={basePath} method="get" className="mt-4 space-y-3">
            <select
              name="courseId"
              defaultValue=""
              className="w-full rounded-2xl border border-[#d9c29b]/55 bg-white/90 px-4 py-3 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
            >
              <option value="">选择课程</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                  {course.status && course.status !== "active" ? ` · ${course.status}` : ""}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="w-full rounded-full border border-[#d9c29b]/55 bg-[#fff8eb] px-4 py-2.5 text-sm font-medium text-[#8f2017] transition-colors hover:border-[#c58d3e] hover:bg-white"
            >
              进入课程
            </button>
          </form>
        ) : (
          <div className="mt-4 rounded-[20px] border border-dashed border-[#d9c29b]/60 bg-[rgba(255,250,241,0.75)] px-4 py-5 text-sm text-stone-500">
            当前还没有课程，请先新增课程。
          </div>
        )}
      </section>

      <section className="portal-panel p-5">
        <div className="flex items-center gap-2 text-stone-900">
          <Plus className="h-5 w-5 text-[#8f2017]" />
          <div>
            <div className="text-xs tracking-[0.18em] text-stone-500">课程管理</div>
            <h2 className="text-base font-semibold">新增课程</h2>
          </div>
        </div>
        <div className="mt-4">
          <CourseCreateForm basePath={basePath} />
        </div>
      </section>
    </div>
  );
}

export default async function ContentManagementConsole({
  basePath,
  backHref,
  backLabel,
  searchParams,
}: ContentManagementConsoleProps) {
  const courses = await listAdminCourses();

  const feedback = readMessageParam(searchParams?.feedback);
  const tone = readMessageParam(searchParams?.tone) || "success";
  const requestedCourseId = readSelectedId(searchParams?.courseId);
  const activeCourse =
    courses.find((course) => course.id === requestedCourseId) || null;

  const units = activeCourse
    ? await listAdminUnitsByCourse(activeCourse.id)
    : [];
  const requestedUnitId = readSelectedId(searchParams?.unitId);
  const activeUnit = units.find((unit) => unit.id === requestedUnitId) || null;

  const lessons = activeUnit ? await listAdminLessons(activeUnit.id) : [];
  const requestedLessonId = readSelectedId(searchParams?.lessonId);
  const activeLesson =
    lessons.find((lesson) => lesson.id === requestedLessonId) || null;

  const modules = activeLesson ? await listAdminModules(activeLesson.id) : [];
  const requestedModuleId = readSelectedId(searchParams?.moduleId);
  const activeModule =
    modules.find((module) => module.id === requestedModuleId) || null;
  const miniApps = activeModule ? await listMiniApps() : [];

  const selection: QuerySelection = {
    courseId: activeCourse?.id,
    unitId: activeUnit?.id,
    lessonId: activeLesson?.id,
    moduleId: activeModule?.id,
  };

  return (
    <div className="space-y-6">
      <section className="portal-panel p-5 md:p-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm text-stone-500 transition-colors hover:text-stone-800"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-stone-900 md:text-3xl">
          课程管理
        </h1>
      </section>

      {feedback ? (
        <div
          className={`rounded-[24px] border px-5 py-4 text-sm ${
            tone === "error"
              ? "border-red-200 bg-red-50/90 text-red-700"
              : "border-emerald-200 bg-emerald-50/90 text-emerald-700"
          }`}
        >
          {feedback}
        </div>
      ) : null}

      {!activeCourse ? (
        <InitialCourseSelection basePath={basePath} courses={courses} />
      ) : null}

      {activeCourse ? (
        <SelectionSummary
          activeCourse={activeCourse}
          activeUnit={activeUnit}
          activeLesson={activeLesson}
          activeModule={activeModule}
        />
      ) : null}

      {activeCourse ? (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          <SelectionCard
            title="课程"
            step="第 0 级"
            name="courseId"
            value={activeCourse?.id}
            placeholder="选择课程"
            submitLabel="进入课程"
            options={courses.map((course) => ({
              value: course.id,
              label: `${course.title}${course.status && course.status !== "active" ? ` · ${course.status}` : ""}`,
            }))}
            basePath={basePath}
            selection={selection}
            preserveKeys={[]}
          >
            <form action={updateCourseAction} className="grid gap-3">
              <input type="hidden" name="courseId" value={activeCourse.id} />
              <input type="hidden" name="description" value={activeCourse.description || ""} />
              <input type="hidden" name="status" value={activeCourse.status || "active"} />
              <input
                name="title"
                defaultValue={activeCourse.title}
                className="rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-3 py-2.5 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
              />
              <div className="flex items-center justify-between gap-2">
                <button
                  type="submit"
                  className="rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-4 py-2 text-sm font-medium text-[#f8ead1]"
                >
                  保存
                </button>
              </div>
            </form>
            <form action={deleteCourseAction} className="mt-3">
              <input type="hidden" name="courseId" value={activeCourse.id} />
              <input type="hidden" name="basePath" value={basePath} />
              <InlineDeleteButton>删除课程</InlineDeleteButton>
            </form>
          </SelectionCard>

          <SelectionCard
            title="单元"
            step="第 1 级"
            name="unitId"
            value={activeUnit?.id}
            placeholder="选择单元"
            submitLabel="进入单元"
            options={units.map((unit) => ({
              value: unit.id,
              label: `第 ${unit.unit_index} 单元 · ${unit.title}`,
            }))}
            basePath={basePath}
            selection={selection}
            preserveKeys={["courseId"]}
          >
            {activeUnit ? (
              <form action={updateUnitAction} className="grid gap-3">
                <input type="hidden" name="unitId" value={activeUnit!.id} />
                <input type="hidden" name="description" value={activeUnit.description || ""} />
                <input
                  name="title"
                  defaultValue={activeUnit.title}
                  className="rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-3 py-2.5 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-4 py-2 text-sm font-medium text-[#f8ead1]"
                  >
                    保存
                  </button>
                </div>
              </form>
            ) : null}
            {activeUnit ? (
              <form action={deleteUnitAction} className="mt-3">
                <input type="hidden" name="courseId" value={activeCourse!.id} />
                <input type="hidden" name="unitId" value={activeUnit!.id} />
                <input type="hidden" name="basePath" value={basePath} />
                <InlineDeleteButton>删除单元</InlineDeleteButton>
              </form>
            ) : null}
            <UnitCreateForm basePath={basePath} courseId={activeCourse!.id} />
          </SelectionCard>

          {activeUnit ? (
            <SelectionCard
              title="课时"
              step="第 2 级"
              name="lessonId"
              value={activeLesson?.id}
              placeholder="选择课时"
              submitLabel="进入课时"
              options={lessons.map((lesson) => ({
                value: lesson.id,
                label: `第 ${lesson.lesson_index} 课时 · ${lesson.title}`,
              }))}
              basePath={basePath}
              selection={selection}
              preserveKeys={["courseId", "unitId"]}
            >
              {activeLesson ? (
                <form action={updateLessonAction} className="grid gap-3">
                  <input type="hidden" name="lessonId" value={activeLesson!.id} />
                  <input type="hidden" name="description" value={activeLesson.description || ""} />
                  <input
                    name="title"
                    defaultValue={activeLesson.title}
                    className="rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-3 py-2.5 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-4 py-2 text-sm font-medium text-[#f8ead1]"
                    >
                      保存
                    </button>
                  </div>
                </form>
              ) : null}
              {activeLesson ? (
                <form action={deleteLessonAction} className="mt-3">
                  <input type="hidden" name="courseId" value={activeCourse!.id} />
                  <input type="hidden" name="unitId" value={activeUnit!.id} />
                  <input type="hidden" name="lessonId" value={activeLesson!.id} />
                  <input type="hidden" name="basePath" value={basePath} />
                  <InlineDeleteButton>删除课时</InlineDeleteButton>
                </form>
              ) : null}
              <LessonCreateForm
                basePath={basePath}
                courseId={activeCourse!.id}
                unitId={activeUnit!.id}
              />
            </SelectionCard>
          ) : null}

          {activeLesson ? (
            <SelectionCard
              title="模块"
              step="第 3 级"
              name="moduleId"
              value={activeModule?.id}
              placeholder="选择模块"
              submitLabel="进入模块"
              options={modules.map((module) => ({
                value: module.id,
                label: `模块 ${module.module_index} · ${module.module_name || module.module_type}`,
              }))}
              basePath={basePath}
              selection={selection}
              preserveKeys={["courseId", "unitId", "lessonId"]}
            >
              {activeModule ? (
                <form action={updateModuleAction} className="grid gap-3">
                  <input type="hidden" name="moduleId" value={activeModule!.id} />
                  <input
                    name="module_name"
                    defaultValue={activeModule.module_name}
                    className="rounded-2xl border border-[#d9c29b]/55 bg-white/88 px-3 py-2.5 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="rounded-full bg-[linear-gradient(180deg,#b83226,#7f1712)] px-4 py-2 text-sm font-medium text-[#f8ead1]"
                    >
                      保存
                    </button>
                  </div>
                </form>
              ) : null}
              {activeModule ? (
                <form action={deleteModuleAction} className="mt-3">
                  <input type="hidden" name="courseId" value={activeCourse!.id} />
                  <input type="hidden" name="unitId" value={activeUnit!.id} />
                  <input type="hidden" name="lessonId" value={activeLesson!.id} />
                  <input type="hidden" name="moduleId" value={activeModule!.id} />
                  <input type="hidden" name="basePath" value={basePath} />
                  <InlineDeleteButton>删除模块</InlineDeleteButton>
                </form>
              ) : null}
              <ModuleCreateForm
                basePath={basePath}
                courseId={activeCourse!.id}
                unitId={activeUnit!.id}
                lessonId={activeLesson!.id}
              />
            </SelectionCard>
          ) : null}
        </div>
      ) : null}

      {activeCourse ? (
        <div className="space-y-6">
          {activeModule ? (
            <ModuleEditor
              module={activeModule}
              miniApps={miniApps}
            />
          ) : null}

          {activeLesson && !activeModule ? (
            <section className="portal-panel p-5 text-sm text-stone-500">
              先选择一个模块，然后在该模块内增删改资源。
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
