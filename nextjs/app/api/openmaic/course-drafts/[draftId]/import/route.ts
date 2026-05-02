import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { spawnSync } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { getCurrentUser } from '@/lib/auth';
import {
  getOpenMaicCourseDraft,
  markOpenMaicCourseDraftImported,
} from '@/lib/openmaic-course-drafts';
import { createMiniApp, createMiniAppVersion } from '@/lib/miniapps';
import { publishMiniAppZip } from '@/lib/miniapps-storage';
import { createTeacherResource, type TeacherResourceRecord } from '@/lib/teacher-plan';

export const dynamic = 'force-dynamic';

type OpenMaicScene = {
  id?: string;
  type?: string;
  title?: string;
  order?: number;
  content?: Record<string, unknown>;
  actions?: Array<Record<string, unknown>>;
};

type PublishedHtml = {
  appKey: string;
  version: string;
  entryUrl: string;
};

function parsePositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function slugifyTitle(value: string): string {
  const ascii = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);

  return ascii || 'openmaic';
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function toScenes(value: unknown): OpenMaicScene[] {
  return Array.isArray(value) ? (value.filter((scene) => scene && typeof scene === 'object') as OpenMaicScene[]) : [];
}

function getSceneTitle(scene: OpenMaicScene, index: number): string {
  return normalizeText(scene.title, `场景 ${index + 1}`).slice(0, 100);
}

function getSpeechNotes(scene: OpenMaicScene): string {
  const actions = Array.isArray(scene.actions) ? scene.actions : [];
  return actions
    .filter((action) => action?.type === 'speech' && typeof action.text === 'string')
    .map((action) => String(action.text).trim())
    .filter(Boolean)
    .join('\n');
}

function describeContent(scene: OpenMaicScene): string {
  const content = scene.content || {};
  if (scene.type === 'quiz' && Array.isArray(content.questions)) {
    return (content.questions as Array<Record<string, unknown>>)
      .map((question, index) => `${index + 1}. ${normalizeText(question.question, '题目')} ${Array.isArray(question.answer) ? `答案：${question.answer.join('、')}` : ''}`)
      .join('\n');
  }

  if (scene.type === 'pbl' && content.projectConfig && typeof content.projectConfig === 'object') {
    const project = content.projectConfig as Record<string, unknown>;
    return [
      normalizeText(project.title, ''),
      normalizeText(project.description, ''),
      Array.isArray(project.tasks) ? `任务：${project.tasks.map((task) => normalizeText((task as Record<string, unknown>).title, '')).filter(Boolean).join('、')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (scene.type === 'interactive') {
    return normalizeText(content.url, '') || normalizeText(content.widgetType, '') || '互动内容';
  }

  return JSON.stringify(content, null, 2).slice(0, 4000);
}

function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root{color-scheme:light;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fff8eb;color:#2d2118}
    body{margin:0;padding:32px;background:linear-gradient(135deg,#fff8eb,#fff,#f8ead1)}
    main{max-width:1080px;margin:0 auto}.card{border:1px solid #e5cfaa;background:rgba(255,255,255,.86);border-radius:28px;padding:28px;margin:0 0 22px;box-shadow:0 18px 48px rgba(92,55,18,.08)}
    h1{font-size:34px;margin:0 0 10px;color:#4b1d17}h2{font-size:24px;margin:0 0 12px;color:#5f241c}.meta{color:#8b6f4c;font-size:14px}.badge{display:inline-flex;border:1px solid #d9c29b;border-radius:999px;padding:4px 10px;color:#8f2017;background:#fff8eb;font-size:12px;font-weight:700}
    pre{white-space:pre-wrap;word-break:break-word;background:#2f261f;color:#fff8eb;border-radius:18px;padding:18px;line-height:1.7}.notes{white-space:pre-wrap;line-height:1.8;color:#4f4033}.slide{min-height:360px;display:flex;flex-direction:column;justify-content:center}.slide h2{font-size:40px}.slide p{font-size:20px;line-height:1.9}
  </style>
</head>
<body><main>${body}</main></body>
</html>`;
}

function buildOpenMaicPptxPayload(title: string, scenes: OpenMaicScene[]): Record<string, unknown> {
  return {
    provider: 'openmaic',
    kind: 'stage-scenes',
    title,
    scenes: scenes
      .filter((scene) => scene.type === 'slide')
      .map((scene, index) => ({
        id: scene.id || `slide-${index + 1}`,
        title: getSceneTitle(scene, index),
        type: scene.type || 'slide',
        content: scene.content || {},
        actions: Array.isArray(scene.actions) ? scene.actions : [],
      })),
  };
}

function buildCoursewareHtml(title: string, scenes: OpenMaicScene[]): string {
  const slideScenes = scenes.filter((scene) => scene.type === 'slide' || scene.type === 'quiz' || scene.type === 'pbl');
  const body = [
    `<section class="card"><span class="badge">OPENMAIC 课件草稿</span><h1>${escapeHtml(title)}</h1><p class="meta">已隐藏课堂讨论与多智能体圆桌，仅导入课件、讲稿、互动游戏、项目任务。</p></section>`,
    ...slideScenes.map((scene, index) => {
      const sceneTitle = getSceneTitle(scene, index);
      const notes = getSpeechNotes(scene);
      const content = describeContent(scene);
      return `<section class="card slide"><span class="badge">${escapeHtml(scene.type || 'scene')}</span><h2>${escapeHtml(sceneTitle)}</h2><p>${escapeHtml(notes || content).replace(/\n/g, '<br />')}</p></section>`;
    }),
  ].join('\n');
  return pageShell(title, body);
}

function buildScriptHtml(title: string, scenes: OpenMaicScene[]): string {
  const body = [
    `<section class="card"><span class="badge">教师讲稿</span><h1>${escapeHtml(title)} · 讲稿</h1><p class="meta">从 OpenMAIC speech actions 自动汇总。</p></section>`,
    ...scenes.map((scene, index) => {
      const notes = getSpeechNotes(scene) || describeContent(scene);
      return `<section class="card"><h2>${escapeHtml(getSceneTitle(scene, index))}</h2><div class="notes">${escapeHtml(notes)}</div></section>`;
    }),
  ].join('\n');
  return pageShell(`${title} · 讲稿`, body);
}

function buildPblHtml(title: string, scenes: OpenMaicScene[]): string | null {
  const pblScenes = scenes.filter((scene) => scene.type === 'pbl');
  if (pblScenes.length === 0) return null;

  const body = [
    `<section class="card"><span class="badge">项目协助</span><h1>${escapeHtml(title)} · 项目任务</h1></section>`,
    ...pblScenes.map((scene, index) => `<section class="card"><h2>${escapeHtml(getSceneTitle(scene, index))}</h2><pre>${escapeHtml(describeContent(scene))}</pre></section>`),
  ].join('\n');
  return pageShell(`${title} · 项目任务`, body);
}

function sanitizeGeneratedHtml(rawHtml: string): string {
  let html = rawHtml.trim();
  html = html.replace(/<script\b[^>]*\bsrc\s*=\s*["'][^"']*["'][^>]*>\s*<\/script>/gi, '');
  html = html.replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '');
  html = html.replace(/<object\b[\s\S]*?<\/object>/gi, '');
  html = html.replace(/<embed\b[\s\S]*?>/gi, '');
  html = html.replace(/javascript:/gi, '');
  if (!/<!doctype html/i.test(html) && !/<html\b/i.test(html)) {
    html = pageShell('互动小游戏', `<section class="card">${html}</section>`);
  }
  const bridge = `<script>(function(){function emit(type,payload){try{window.parent&&window.parent.postMessage({type:'miniapp:event',eventType:type,payload:payload||{}},'*')}catch(e){}}window.__courseMiniAppEmit=emit;emit('start',{source:'openmaic-draft'});window.addEventListener('beforeunload',function(){emit('complete',{source:'openmaic-draft',auto:true})});})();<\/script>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${bridge}</body>`) : `${html}${bridge}`;
}

function buildFallbackGameHtml(title: string, scene: OpenMaicScene): string {
  const prompt = getSpeechNotes(scene) || describeContent(scene) || title;
  const questions = [
    { question: `${title} 的核心目标是什么？`, options: ['理解并应用知识', '只记住标题', '跳过练习'], answer: 0 },
    { question: '完成本关后应该做什么？', options: ['分享答案并复盘', '关闭页面', '忽略反馈'], answer: 0 },
  ];
  return pageShell(
    title,
    `<section class="card"><span class="badge">互动闯关</span><h1>${escapeHtml(title)}</h1><p class="notes">${escapeHtml(prompt)}</p><div id="game"></div></section><script>const questions=${escapeJsonForScript(questions)};let score=0;const root=document.getElementById('game');function emit(type,payload){try{window.parent&&window.parent.postMessage({type:'miniapp:event',eventType:type,payload:payload||{}},'*')}catch(e){}}function render(){root.innerHTML=questions.map((q,i)=>'<div class="card"><h2>'+(i+1)+'. '+q.question+'</h2>'+q.options.map((o,j)=>'<button data-i="'+i+'" data-j="'+j+'" style="margin:6px;padding:10px 14px;border-radius:999px;border:1px solid #d9c29b;background:white">'+o+'</button>').join('')+'</div>').join('')+'<button id="done" style="padding:12px 20px;border:0;border-radius:999px;background:#8f2017;color:#fff8eb">完成挑战</button>';document.querySelectorAll('button[data-i]').forEach(b=>b.onclick=()=>{const ok=Number(b.dataset.j)===questions[Number(b.dataset.i)].answer;if(ok)score++;b.style.background=ok?'#dcfce7':'#fee2e2';emit('answer',{correct:ok,score});});document.getElementById('done').onclick=()=>{emit('complete',{score,total:questions.length});alert('完成！得分 '+score+'/'+questions.length)}}emit('start',{title:${escapeJsonForScript(title)}});render();</script>`,
  );
}

async function createZipBuffer(files: Record<string, string>): Promise<Buffer> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'openmaic-import-'));
  const zipPath = path.join(tempDir, 'bundle.zip');

  try {
    await Promise.all(Object.entries(files).map(([fileName, content]) => writeFile(path.join(tempDir, fileName), content)));
    const result = spawnSync(
      'python3',
      ['-c', 'import sys, zipfile\nzip_path = sys.argv[1]\nfiles = sys.argv[2:]\nwith zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:\n    for name in files:\n        archive.write(name, name)', zipPath, ...Object.keys(files)],
      { cwd: tempDir, encoding: 'utf8' },
    );

    if (result.status !== 0) {
      throw new Error(result.stderr || '压缩资源失败');
    }

    const { readFile } = await import('fs/promises');
    return readFile(zipPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function publishHtmlAsset(title: string, html: string, prefix: string): Promise<PublishedHtml> {
  const suffix = randomUUID().slice(0, 8);
  const appKey = `${prefix}-${slugifyTitle(title)}-${suffix}`.slice(0, 64);
  const version = `v${Date.now()}`;
  const zipBuffer = await createZipBuffer({
    'index.html': html,
    'manifest.json': `${JSON.stringify({ name: title, generatedBy: 'openmaic-import', entry: 'index.html' }, null, 2)}\n`,
  });
  const published = await publishMiniAppZip({ appKey, version, zipBuffer, entryFile: 'index.html', overwrite: false });
  return { appKey, version, entryUrl: published.entryUrl };
}

async function importInteractiveScene(input: {
  authUserId: string;
  lessonId: number;
  moduleId: number;
  draftTitle: string;
  scene: OpenMaicScene;
  index: number;
}): Promise<TeacherResourceRecord> {
  const title = getSceneTitle(input.scene, input.index);
  const content = input.scene.content || {};
  const rawHtml = typeof content.html === 'string' && content.html.trim() ? content.html : null;
  const html = rawHtml ? sanitizeGeneratedHtml(rawHtml) : buildFallbackGameHtml(title, input.scene);
  const published = await publishHtmlAsset(title, html, 'openmaic-game');
  const miniApp = await createMiniApp({
    appKey: published.appKey,
    name: title,
    description: `${input.draftTitle} · OpenMAIC 互动游戏`,
    category: 'OpenMAIC 生成',
    vendorName: 'OpenMAIC 集成',
    sourceType: 'local',
    status: 'published',
  });
  const version = await createMiniAppVersion({
    miniAppId: miniApp.id,
    version: published.version,
    entryUrl: published.entryUrl,
    sourceType: 'local',
    manifest: { name: title, generatedBy: 'openmaic-import', sceneId: input.scene.id || null, entry: 'index.html' },
    releaseNotes: 'OpenMAIC 整课草稿导入的互动游戏',
    publish: true,
  });

  return createTeacherResource(input.authUserId, {
    lesson_id: input.lessonId,
    module_id: input.moduleId,
    title,
    item_type: 'miniapp',
    file_url: null,
    duration: 0,
    miniAppMount: {
      miniAppId: miniApp.id,
      miniAppVersionId: version.id,
      aspectRatio: '16:9',
      titleOverride: title,
      coverUrl: null,
      mountStatus: 'active',
      params: { generatedBy: 'openmaic-import', sourceDraftTitle: input.draftTitle, sceneId: input.scene.id || null },
    },
  });
}

function toTeacherResourceResponse(resource: TeacherResourceRecord) {
  return { ...resource, miniappMount: resource.miniAppMount ?? null };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ draftId: string }> },
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !['teacher', 'admin'].includes(currentUser.role)) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const { draftId: rawDraftId } = await context.params;
    const draftId = parsePositiveInt(rawDraftId);
    if (!draftId) {
      return NextResponse.json({ error: '草稿 ID 无效' }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const lessonId = parsePositiveInt(body?.lessonId ?? body?.lesson_id);
    const moduleId = parsePositiveInt(body?.moduleId ?? body?.module_id);
    if (!lessonId) {
      return NextResponse.json({ error: '请选择要导入的课时' }, { status: 400 });
    }
    if (!moduleId) {
      return NextResponse.json({ error: '请选择要导入的流程/模块' }, { status: 400 });
    }

    const draft = await getOpenMaicCourseDraft(currentUser.id, draftId);
    if (!draft) {
      return NextResponse.json({ error: 'OpenMAIC 草稿不存在' }, { status: 404 });
    }

    const scenes = toScenes(draft.scenes_json);
    if (scenes.length === 0) {
      return NextResponse.json({ error: '草稿中没有可导入场景' }, { status: 400 });
    }

    const resources: TeacherResourceRecord[] = [];
    const courseware = await publishHtmlAsset(draft.title, buildCoursewareHtml(draft.title, scenes), 'openmaic-courseware');
    resources.push(await createTeacherResource(currentUser.id, {
      lesson_id: lessonId,
      module_id: moduleId,
      title: `${draft.title} · 课件/PPT草稿`,
      item_type: 'ppt',
      file_url: courseware.entryUrl,
      duration: 0,
      source_model: 'openmaic',
      source_prompt: draft.title,
      source_payload: buildOpenMaicPptxPayload(draft.title, scenes),
    }));

    const script = await publishHtmlAsset(`${draft.title}-script`, buildScriptHtml(draft.title, scenes), 'openmaic-script');
    resources.push(await createTeacherResource(currentUser.id, {
      lesson_id: lessonId,
      module_id: moduleId,
      title: `${draft.title} · 教师讲稿`,
      item_type: 'doc',
      file_url: script.entryUrl,
      duration: 0,
    }));

    const pblHtml = buildPblHtml(draft.title, scenes);
    if (pblHtml) {
      const pbl = await publishHtmlAsset(`${draft.title}-project`, pblHtml, 'openmaic-project');
      resources.push(await createTeacherResource(currentUser.id, {
        lesson_id: lessonId,
        module_id: moduleId,
        title: `${draft.title} · 项目任务`,
        item_type: 'doc',
        file_url: pbl.entryUrl,
        duration: 0,
      }));
    }

    const interactiveScenes = scenes.filter((scene) => scene.type === 'interactive');
    for (let index = 0; index < interactiveScenes.length; index += 1) {
      const scene = interactiveScenes[index];
      resources.push(await importInteractiveScene({
        authUserId: currentUser.id,
        lessonId,
        moduleId,
        draftTitle: draft.title,
        scene,
        index,
      }));
    }

    await markOpenMaicCourseDraftImported(currentUser.id, draft.id);

    return NextResponse.json({
      success: true,
      importedCount: resources.length,
      resources: resources.map(toTeacherResourceResponse),
    });
  } catch (error) {
    console.error('Import OpenMAIC draft failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '导入 OpenMAIC 草稿失败' },
      { status: 500 },
    );
  }
}
