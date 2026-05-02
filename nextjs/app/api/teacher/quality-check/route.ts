import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDefaultAiModelConfig } from '@/lib/ai-model-config';

export const dynamic = 'force-dynamic';

type QualityCheckResult = {
  overallScore: number;
  dimensions: Array<{ key: string; label: string; score: number; comment: string }>;
  strengths: string[];
  risks: string[];
  improvements: string[];
  revisedPrompt: string;
  source: 'llm' | 'rules';
};

function normalizeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function stripCodeFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
}

function ruleBasedCheck(input: { objective: string; gradeLevel: string; content: string; activity: string }): QualityCheckResult {
  const text = `${input.objective}\n${input.content}\n${input.activity}`;
  const dimensions = [
    { key: 'objective_alignment', label: '目标对齐', score: input.objective && input.content.includes(input.objective.slice(0, Math.min(6, input.objective.length))) ? 85 : 70, comment: input.objective ? '已提供教学目标，建议在课件和活动中显式标注目标达成证据。' : '缺少明确教学目标。' },
    { key: 'grade_fit', label: '学段适配', score: /小学|初中|高中|一年级|二年级|三年级|四年级|五年级|六年级/.test(input.gradeLevel + text) ? 82 : 72, comment: '建议补充学生已有经验、词汇难度和操作时长。' },
    { key: 'activity_design', label: '活动设计', score: /步骤|任务|小组|讨论|游戏|实操|项目|材料/.test(text) ? 84 : 68, comment: '活动需要目标、材料、步骤、产出和时间分配。' },
    { key: 'assessment', label: '评价闭环', score: /评价|量规|标准|反馈|得分|自评|互评/.test(text) ? 82 : 62, comment: '建议加入可观察评价标准和学生产出证据。' },
  ];
  const overallScore = Math.round(dimensions.reduce((sum, item) => sum + item.score, 0) / dimensions.length);
  return {
    overallScore,
    dimensions,
    strengths: ['内容已具备教学主题和基本活动方向。', '可继续转化为课件、讲稿或项目任务。'],
    risks: overallScore >= 80 ? ['需继续验证课堂时间是否足够。'] : ['目标、活动和评价之间的对应关系还不够清晰。', '学生产出和评价标准需要进一步具体化。'],
    improvements: ['用一句话写清本课核心目标。', '把活动拆成 3-5 个可执行步骤并标注时间。', '补充评价量规：优秀/达标/待改进。'],
    revisedPrompt: `请基于${input.gradeLevel || '当前学段'}，围绕“${input.objective || '本课目标'}”重写教学内容：包含目标、导入、讲解、互动活动、项目实操、评价量规和课堂小结，并确保每个活动都能证明目标达成。`,
    source: 'rules',
  };
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const objective = normalizeText(body?.objective).slice(0, 1200);
  const gradeLevel = normalizeText(body?.gradeLevel, '小学').slice(0, 80);
  const content = normalizeText(body?.content).slice(0, 8000);
  const activity = normalizeText(body?.activity).slice(0, 4000);
  if (!objective && !content && !activity) {
    return NextResponse.json({ error: '请填写教学目标、内容或活动方案' }, { status: 400 });
  }

  const fallback = ruleBasedCheck({ objective, gradeLevel, content, activity });
  const modelConfig = await getDefaultAiModelConfig(currentUser.id).catch(() => null);
  if (!modelConfig) {
    return NextResponse.json({ success: true, result: fallback, warning: '未配置教师大模型，已使用规则检查。' });
  }

  try {
    const response = await fetch(`${modelConfig.base_url.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${modelConfig.api_key}` },
      body: JSON.stringify({
        model: modelConfig.model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: '你是资深教研员和课程质量评审专家。只返回严格 JSON，不要 markdown，不要思考过程。' },
          { role: 'user', content: `请评估以下教学设计质量，返回 JSON：{ "overallScore": number, "dimensions": [{"key":"objective_alignment|grade_fit|activity_design|assessment", "label": string, "score": number, "comment": string}], "strengths": string[], "risks": string[], "improvements": string[], "revisedPrompt": string }。
学段：${gradeLevel}
教学目标：${objective || '未填写'}
教学内容：${content || '未填写'}
活动/项目：${activity || '未填写'}` },
        ],
      }),
      cache: 'no-store',
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) throw new Error(json?.error?.message || `LLM HTTP ${response.status}`);
    const text = json?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(stripCodeFence(String(text || ''))) as Omit<QualityCheckResult, 'source'>;
    return NextResponse.json({ success: true, result: { ...parsed, source: 'llm' } });
  } catch (error) {
    return NextResponse.json({ success: true, result: fallback, warning: error instanceof Error ? `大模型评估失败，已使用规则检查：${error.message}` : '大模型评估失败，已使用规则检查。' });
  }
}
