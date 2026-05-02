import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getCurrentUser } from '@/lib/auth';
import { buildOpenMaicHeaders, getOpenMaicBaseUrl } from '@/lib/openmaic-client';
import { getDefaultAiModelConfig } from '@/lib/ai-model-config';

export const dynamic = 'force-dynamic';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

function normalizeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((message): message is Record<string, unknown> => Boolean(message) && typeof message === 'object')
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: normalizeText(message.content).slice(0, 4000),
    }))
    .filter((message) => message.content)
    .slice(-12);
}

function toOpenMaicMessages(messages: ChatMessage[]) {
  return messages.map((message) => ({
    id: randomUUID(),
    role: message.role,
    parts: [{ type: 'text', text: message.content }],
    metadata: {
      senderName: message.role === 'assistant' ? '课程创作助手' : '教师',
      originalRole: message.role === 'assistant' ? 'agent' : 'user',
      createdAt: Date.now(),
    },
  }));
}


function stripEmoji(value: string): string {
  return value.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]\uFE0F?|\uFE0F/g, '');
}

function stripActionJson(value: string): string {
  let text = value;
  text = text.replace(/```(?:json)?\s*[\s\S]*?"type"\s*:\s*"action"[\s\S]*?```/gi, '').trim();
  text = text.replace(/```(?:json)?\s*\[[\s\S]*?"name"\s*:\s*"wb_[^"]+"[\s\S]*?\]\s*```/gi, '').trim();
  text = text.replace(/\{\s*"type"\s*:\s*"action"\s*,\s*"name"\s*:\s*"wb_[\s\S]*?\}\s*,?/gi, '').trim();
  text = text.replace(/^\s*\{\s*"type"\s*:\s*"action"[\s\S]*$/gim, '').trim();
  text = text.replace(/^\s*\{"type":"action"[\s\S]*$/gim, '').trim();
  text = text.replace(/^\s*\]\s*```\s*$/gm, '').trim();
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

function stripThinking(value: string): string {
  return value
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^[ \t]*(思考过程|推理过程|分析过程)[:：][\s\S]*?(?=\n\n|$)/gim, '')
    .trim();
}

function normalizeAssistantForTeacher(value: string): string {
  const withoutThinking = stripThinking(value);
  const withoutActions = stripActionJson(withoutThinking);
  const withoutEmoji = stripEmoji(withoutActions);
  return withoutEmoji
    .replace(/^[ \t]*[-*]\s*$/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanAssistantAnswer(value: string): string {
  let text = value.trim();
  const structuredIndex = text.indexOf('{"type":"text","content"');
  if (structuredIndex > 0) {
    text = text.slice(0, structuredIndex).trim();
  }
  text = text.replace(/```[a-zA-Z]*\s*$/g, '').trim();
  text = text.replace(/\]\s*```\s*$/g, '').trim();
  return normalizeAssistantForTeacher(text);
}

function extractSseAnswer(text: string): string {
  const chunks: string[] = [];
  for (const block of text.split(/\n\n+/)) {
    const line = block.split(/\n/).find((item) => item.startsWith('data:'));
    if (!line) continue;
    const raw = line.replace(/^data:\s*/, '').trim();
    if (!raw || raw === '[DONE]') continue;
    try {
      const event = JSON.parse(raw) as { type?: string; data?: any };
      if (event.type === 'text_delta') {
        chunks.push(String(event.data?.content || event.data?.delta || ''));
      }
      if (event.type === 'error') {
        throw new Error(String(event.data?.message || 'OpenMAIC 对话失败'));
      }
    } catch (error) {
      if (error instanceof Error && error.message !== 'Unexpected end of JSON input') {
        throw error;
      }
    }
  }
  return cleanAssistantAnswer(chunks.join(''));
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
    return NextResponse.json({ error: '未授权' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const messages = normalizeMessages(body?.messages);
  const message = normalizeText(body?.message).slice(0, 4000);
  if (message) {
    messages.push({ role: 'user', content: message });
  }
  if (messages.length === 0 || messages[messages.length - 1]?.role !== 'user') {
    return NextResponse.json({ error: '请填写对话内容' }, { status: 400 });
  }

  const modelConfig = await getDefaultAiModelConfig(currentUser.id);
  const stageName = normalizeText(body?.stageName, '课程创作工作台').slice(0, 120);
  const context = normalizeText(body?.context).slice(0, 3000);
  const systemHint = [
    '你是课程平台里的课程创作助手，只服务教师备课和项目实操。',
    '你只能输出给教师阅读的自然语言内容，例如：PPT大纲、讲稿、互动游戏说明、项目任务、评价量规和实操步骤。',
    '严禁输出 JSON、数组、代码块、工具调用、白板动作、wb_open、wb_draw_text、wb_draw_shape、type=action 或任何结构化 action 指令。',
    '严禁使用 emoji、表情符号和装饰性图标。',
    '不要组织课堂圆桌讨论，不要模拟多智能体辩论，不要引导学生实时AI讨论。',
  ].join('');

  const openMaicBody = {
    messages: toOpenMaicMessages([
      ...messages.slice(0, -1),
      {
        role: 'user',
        content: `${context ? `当前课程上下文：\n${context}\n\n` : ''}${messages[messages.length - 1].content}\n\n请遵守：${systemHint}`,
      },
    ]),
    storeState: {
      stage: {
        id: 'course-platform-chat',
        name: stageName,
        description: context || '教师课程创作助手',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        agentIds: ['default-2'],
      },
      scenes: [],
      currentSceneId: null,
      mode: 'autonomous',
      whiteboardOpen: false,
    },
    config: {
      agentIds: ['default-2'],
      sessionType: 'qa',
    },
    directorState: {
      turnCount: 0,
      agentResponses: [],
      whiteboardLedger: [],
    },
    userProfile: {
      nickname: currentUser.role === 'admin' ? '管理员' : '教师',
      bio: '课程平台用户',
    },
    apiKey: modelConfig?.api_key || process.env.OPENAI_API_KEY || '',
    baseUrl: modelConfig?.base_url || process.env.OPENAI_BASE_URL,
    model: modelConfig ? `openai:${modelConfig.model}` : process.env.DEFAULT_MODEL,
    providerType: 'openai',
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch(`${getOpenMaicBaseUrl()}/api/chat`, {
      method: 'POST',
      headers: await buildOpenMaicHeaders(currentUser.id),
      body: JSON.stringify(openMaicBody),
      cache: 'no-store',
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) {
      let error = `OpenMAIC 对话失败：HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(raw);
        error = parsed.error || parsed.message || error;
      } catch {}
      return NextResponse.json({ error }, { status: response.status || 502 });
    }

    const answer = extractSseAnswer(raw);
    if (!answer) {
      return NextResponse.json({ error: 'OpenMAIC 未返回对话内容' }, { status: 502 });
    }

    return NextResponse.json({ success: true, message: normalizeAssistantForTeacher(answer), agentName: '课程创作助手' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'OpenMAIC 对话失败' },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
