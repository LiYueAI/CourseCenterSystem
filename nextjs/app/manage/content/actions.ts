"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireContentManager } from "@/lib/content-auth";
import {
  createAdminCourse,
  createAdminLesson,
  createAdminModule,
  createAdminUnit,
  deleteAdminCourseCascade,
  deleteAdminLessonCascade,
  deleteAdminModuleCascade,
  deleteAdminUnitCascade,
  listAdminCourses,
  listAdminLessons,
  listAdminModules,
  listAdminUnitsByCourse,
  reindexAdminCourses,
  reindexAdminLessons,
  reindexAdminModules,
  reindexAdminUnitsByCourse,
  updateAdminCourse,
  updateAdminLesson,
  updateAdminModule,
  updateAdminUnit,
} from "@/lib/directus-admin";

function revalidateContentPages() {
  revalidatePath("/manage/content");
}

function getBasePath(formData: FormData): string {
  return String(formData.get("basePath") || "/manage/content");
}

function getNumber(formData: FormData, key: string): number {
  return Number(formData.get(key));
}

function getString(formData: FormData, key: string): string {
  return String(formData.get(key) || "").trim();
}

function getModuleType(moduleName: string, moduleType: string): string {
  return moduleType || moduleName;
}

function buildContentRedirect(
  basePath: string,
  params: Record<string, string | number | undefined>,
  feedback?: string,
  tone: "success" | "error" = "error",
): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    query.set(key, String(value));
  }

  if (feedback) {
    query.set("feedback", feedback);
    query.set("tone", tone);
  }

  const suffix = query.toString();
  return suffix ? `${basePath}?${suffix}` : basePath;
}

export async function updateUnitAction(formData: FormData) {
  await requireContentManager();

  const unitId = getNumber(formData, "unitId");
  const title = getString(formData, "title");
  const description = getString(formData, "description");

  if (!unitId || !title) {
    throw new Error("Invalid unit payload");
  }

  await updateAdminUnit(unitId, { title, description: description || null });
  revalidateContentPages();
}

export async function updateCourseAction(formData: FormData) {
  await requireContentManager();

  const courseId = getNumber(formData, "courseId");
  const title = getString(formData, "title");
  const description = getString(formData, "description");
  const status = getString(formData, "status") || "active";

  if (!courseId || !title) {
    throw new Error("Invalid course payload");
  }

  await updateAdminCourse(courseId, {
    title,
    description: description || null,
    status,
  });
  revalidateContentPages();
}

export async function createCourseAction(formData: FormData) {
  await requireContentManager();

  const basePath = getBasePath(formData);
  const title = getString(formData, "title");
  const description = getString(formData, "description");

  if (!title) {
    redirect(buildContentRedirect(basePath, {}, "请先填写课程名称。"));
  }

  const courses = await listAdminCourses();
  const course = await createAdminCourse({
    title,
    description: description || null,
    status: "active",
    course_index: courses.length + 1,
  });

  revalidateContentPages();
  redirect(`${basePath}?courseId=${course.id}`);
}

export async function deleteCourseAction(formData: FormData) {
  await requireContentManager();

  const basePath = getBasePath(formData);
  const courseId = getNumber(formData, "courseId");

  if (!courseId) {
    throw new Error("Invalid course id");
  }

  await deleteAdminCourseCascade(courseId);
  await reindexAdminCourses();
  revalidateContentPages();
  redirect(basePath);
}

export async function createUnitAction(formData: FormData) {
  await requireContentManager();

  const basePath = getBasePath(formData);
  const courseId = getNumber(formData, "courseId");
  const title = getString(formData, "title");
  const description = getString(formData, "description");

  if (!courseId || !title) {
    redirect(
      buildContentRedirect(
        basePath,
        { courseId },
        !courseId ? "请先选择课程。" : "请先填写单元标题。",
      ),
    );
  }

  const units = await listAdminUnitsByCourse(courseId);
  const unit = await createAdminUnit({
    course_id: courseId,
    title,
    description: description || null,
    unit_index: units.length + 1,
  });

  revalidateContentPages();
  redirect(`${basePath}?courseId=${courseId}&unitId=${unit.id}`);
}

export async function deleteUnitAction(formData: FormData) {
  await requireContentManager();

  const basePath = getBasePath(formData);
  const courseId = getNumber(formData, "courseId");
  const unitId = getNumber(formData, "unitId");

  if (!unitId) {
    throw new Error("Invalid unit id");
  }

  await deleteAdminUnitCascade(unitId);
  if (courseId) {
    await reindexAdminUnitsByCourse(courseId);
  }
  revalidateContentPages();
  redirect(courseId ? `${basePath}?courseId=${courseId}` : basePath);
}

export async function updateLessonAction(formData: FormData) {
  await requireContentManager();

  const lessonId = getNumber(formData, "lessonId");
  const title = getString(formData, "title");
  const description = getString(formData, "description");

  if (!lessonId || !title) {
    throw new Error("Invalid lesson payload");
  }

  await updateAdminLesson(lessonId, {
    title,
    description: description || null,
  });

  revalidateContentPages();
}

export async function createLessonAction(formData: FormData) {
  await requireContentManager();

  const basePath = getBasePath(formData);
  const courseId = getNumber(formData, "courseId");
  const unitId = getNumber(formData, "unitId");
  const title = getString(formData, "title");
  const description = getString(formData, "description");

  if (!unitId || !title) {
    redirect(
      buildContentRedirect(
        basePath,
        { courseId, unitId },
        !unitId ? "请先选择单元。" : "请先填写课时标题。",
      ),
    );
  }

  const lessons = await listAdminLessons(unitId);
  const lesson = await createAdminLesson({
    unit_id: unitId,
    lesson_index: lessons.length + 1,
    title,
    description: description || null,
  });

  await reindexAdminLessons(unitId);
  revalidateContentPages();
  redirect(
    `${basePath}?courseId=${courseId}&unitId=${unitId}&lessonId=${lesson.id}`,
  );
}

export async function deleteLessonAction(formData: FormData) {
  await requireContentManager();

  const basePath = getBasePath(formData);
  const courseId = getNumber(formData, "courseId");
  const unitId = getNumber(formData, "unitId");
  const lessonId = getNumber(formData, "lessonId");

  if (!unitId || !lessonId) {
    throw new Error("Invalid lesson id");
  }

  await deleteAdminLessonCascade(lessonId);
  revalidateContentPages();
  redirect(`${basePath}?courseId=${courseId}&unitId=${unitId}`);
}

export async function updateModuleAction(formData: FormData) {
  await requireContentManager();

  const moduleId = getNumber(formData, "moduleId");
  const module_name = getString(formData, "module_name");
  const module_type = getModuleType(
    module_name,
    getString(formData, "module_type"),
  );
  const description = getString(formData, "description");

  if (!moduleId || !module_name || !module_type) {
    throw new Error("Invalid module payload");
  }

  await updateAdminModule(moduleId, {
    module_name,
    module_type,
    description: description || null,
  });

  revalidateContentPages();
}

export async function createModuleAction(formData: FormData) {
  await requireContentManager();

  const basePath = getBasePath(formData);
  const courseId = getNumber(formData, "courseId");
  const unitId = getNumber(formData, "unitId");
  const lessonId = getNumber(formData, "lessonId");
  const module_name = getString(formData, "module_name");
  const module_type = getModuleType(
    module_name,
    getString(formData, "module_type"),
  );
  const description = getString(formData, "description");
  const assignmentRequired = formData.get("assignment_required") === "on";
  const unlockMode = getString(formData, "unlock_mode") || "sequential";

  if (!lessonId || !module_name || !module_type) {
    redirect(
      buildContentRedirect(
        basePath,
        { courseId, unitId, lessonId },
        !lessonId ? "请先选择课时。" : "请先填写模块名称。",
      ),
    );
  }

  const modules = await listAdminModules(lessonId);
  const module = await createAdminModule({
    lesson_id: lessonId,
    module_index: modules.length + 1,
    module_name,
    module_type,
    description: description || null,
    assignment_required: assignmentRequired,
    unlock_mode: unlockMode,
  });

  await reindexAdminModules(lessonId);
  revalidateContentPages();
  redirect(
    `${basePath}?courseId=${courseId}&unitId=${unitId}&lessonId=${lessonId}&moduleId=${module.id}`,
  );
}

export async function deleteModuleAction(formData: FormData) {
  await requireContentManager();

  const basePath = getBasePath(formData);
  const courseId = getNumber(formData, "courseId");
  const unitId = getNumber(formData, "unitId");
  const lessonId = getNumber(formData, "lessonId");
  const moduleId = getNumber(formData, "moduleId");

  if (!lessonId || !moduleId) {
    throw new Error("Invalid module id");
  }

  await deleteAdminModuleCascade(moduleId);
  await reindexAdminModules(lessonId);
  revalidateContentPages();
  redirect(
    `${basePath}?courseId=${courseId}&unitId=${unitId}&lessonId=${lessonId}`,
  );
}
