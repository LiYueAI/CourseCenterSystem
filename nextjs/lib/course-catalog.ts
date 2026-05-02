export type CourseCatalogEntry = {
  title: string;
  description: string;
  desiredIndex: number;
  ensurePlaceholderStructure: boolean;
};

type CourseVisibilityInput = {
  title?: string | null;
  description?: string | null;
};

export const COURSE_CATALOG: CourseCatalogEntry[] = [
  {
    title: "礼乐课程",
    description: "围绕礼乐文化、课堂表达与审美启发组织标准课程。",
    desiredIndex: 1,
    ensurePlaceholderStructure: false,
  },
  {
    title: "探秘农业",
    description: "待添加",
    desiredIndex: 2,
    ensurePlaceholderStructure: true,
  },
  {
    title: "机器人",
    description: "待添加",
    desiredIndex: 3,
    ensurePlaceholderStructure: true,
  },
  {
    title: "水世界",
    description: "待添加",
    desiredIndex: 4,
    ensurePlaceholderStructure: true,
  },
];

export const PLACEHOLDER_COURSE_TITLES = new Set(
  COURSE_CATALOG.filter((entry) => entry.ensurePlaceholderStructure).map(
    (entry) => entry.title,
  ),
);

export function isTeacherHiddenCourse(input: CourseVisibilityInput): boolean {
  const title = input.title?.trim().toLowerCase() || '';
  const description = input.description?.trim().toLowerCase() || '';

  return title.includes('openmaic') || description.includes('openmaic');
}
