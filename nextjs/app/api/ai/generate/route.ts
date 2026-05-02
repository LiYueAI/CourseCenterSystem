import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getDefaultAiModelConfig } from '@/lib/ai-model-config';

type AiRuntimeConfig = {
  baseUrl: string;
  apiKey: string;
  textModel: string;
  imageModel: string;
};

function buildHeaders(apiKey: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

async function resolveAiConfig(authUserId: string): Promise<AiRuntimeConfig> {
  const userConfig = await getDefaultAiModelConfig(authUserId);
  return {
    baseUrl: userConfig?.base_url || process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || '',
    apiKey: userConfig?.api_key || process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '',
    textModel: userConfig?.model || process.env.AI_TEXT_MODEL || process.env.DEFAULT_MODEL?.replace(/^openai:/, '') || process.env.OPENAI_MODELS?.split(',')[0]?.trim() || '',
    imageModel: process.env.AI_IMAGE_MODEL || process.env.OPENMAIC_IMAGE_MODEL || '',
  };
}

async function generateFreeText(config: AiRuntimeConfig, prompt: string) {
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(config.apiKey),
    body: JSON.stringify({
      model: config.textModel,
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content: '你是一名中小学课程创作助手。请用简体中文给出可直接用于教学的内容。',
        },
        { role: 'user', content: prompt },
      ],
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI text generation failed: ${response.status} ${text}`);
  }

  const json = await response.json();
  return json?.choices?.[0]?.message?.content?.trim() || '';
}

async function generateLessonText(config: AiRuntimeConfig, theme: string, gradeBand: string, needImage: boolean) {
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(config.apiKey),
    body: JSON.stringify({
      model: config.textModel,
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content:
            '你是一名全国中小学主题课程平台的课程策划助手。请输出专业、简洁、可直接用于教学平台的中文内容。',
        },
        {
          role: 'user',
          content: `请为“${theme}”主题生成一份适合${gradeBand}的课程草案，包含：1. 课程简介；2. 三个课堂目标；3. 五段课堂流程；4. 一段适合老师端展示的讲解词；${needImage ? '5. 一句适合作为海报/插图生成提示词的中文描述。' : ''}`,
        },
      ],
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI text generation failed: ${response.status} ${text}`);
  }

  const json = await response.json();
  return json?.choices?.[0]?.message?.content?.trim() || '';
}

async function generateImage(config: AiRuntimeConfig, theme: string, gradeBand: string) {
  if (!config.imageModel) {
    return null;
  }

  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/images/generations`, {
    method: 'POST',
    headers: buildHeaders(config.apiKey),
    body: JSON.stringify({
      model: config.imageModel,
      prompt: `为全国中小学主题课程平台生成一张教育场景插图，主题是${theme}，适用学段是${gradeBand}，风格要求专业、现代、教育感、科技感、适合作为官网或老师端海报。`,
      size: '1024x1024',
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI image generation failed: ${response.status} ${text}`);
  }

  const json = await response.json();
  return json?.data?.[0]?.url || null;
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const config = await resolveAiConfig(currentUser.id);

    if (!config.baseUrl || !config.apiKey || !config.textModel) {
      return NextResponse.json(
        {
          configured: false,
          error: 'AI 服务未配置。请在教师/管理员大模型配置中填写 Base URL、API Key 和模型，或补充环境变量。',
        },
        { status: 503 }
      );
    }

    const body = await request.json();
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    const theme = typeof body?.theme === 'string' ? body.theme.trim() : prompt;
    const gradeBand = typeof body?.gradeBand === 'string' ? body.gradeBand.trim() : '小学';
    const needImage = Boolean(body?.needImage || body?.type === 'image');

    if (!theme) {
      return NextResponse.json({ error: '主题或提示词不能为空' }, { status: 400 });
    }

    const text = prompt && !body?.theme ? await generateFreeText(config, prompt) : await generateLessonText(config, theme, gradeBand, needImage);
    const imageUrl = needImage ? await generateImage(config, theme, gradeBand) : null;

    return NextResponse.json({
      configured: true,
      text,
      imageUrl,
    });
  } catch (error) {
    console.error('AI generate failed:', error);
    return NextResponse.json({ error: 'AI 生成失败' }, { status: 500 });
  }
}
