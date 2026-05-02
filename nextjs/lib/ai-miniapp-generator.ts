import 'server-only';

import { randomUUID } from 'crypto';
import { spawnSync } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { getDefaultAiModelConfig } from '@/lib/ai-model-config';
import { getDefaultAiMiniAppTitle } from '@/lib/ai-miniapp-title';
import { createMiniApp, createMiniAppVersion } from '@/lib/miniapps';
import { publishMiniAppZip } from '@/lib/miniapps-storage';
import { callOpenMaicJson, getOpenMaicBaseUrl } from '@/lib/openmaic-client';

export type AiMiniAppGameType = 'quiz' | 'matching' | 'sequence';
export type AiMiniAppGenerationSource = 'openmaic' | 'template';

export interface AiMiniAppPreviewPayload {
  title: string;
  prompt: string;
  gradeLevel: string;
  gameType: AiMiniAppGameType;
  html: string;
  generationSource: AiMiniAppGenerationSource;
  openMaicError: string | null;
}

function normalizeGameType(value: unknown): AiMiniAppGameType {
  return value === 'matching' || value === 'sequence' ? value : 'quiz';
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

  return ascii || 'ai-game';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function sanitizeGeneratedHtml(rawHtml: string): string {
  let html = rawHtml.trim();

  html = html.replace(/<script\b[^>]*\bsrc\s*=\s*["'][^"']*["'][^>]*>\s*<\/script>/gi, '');
  html = html.replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '');
  html = html.replace(/<object\b[\s\S]*?<\/object>/gi, '');
  html = html.replace(/<embed\b[\s\S]*?>/gi, '');
  html = html.replace(/<link\b[^>]*\brel\s*=\s*["']?stylesheet["']?[^>]*>/gi, '');
  html = html.replace(/\s(on[a-z]+)\s*=\s*"[^"]*"/gi, '');
  html = html.replace(/\s(on[a-z]+)\s*=\s*'[^']*'/gi, '');
  html = html.replace(/\s(on[a-z]+)\s*=\s*[^\s>]+/gi, '');
  html = html.replace(/javascript:/gi, '');
  html = html.replace(/https?:\/\//gi, '');

  if (!/<!doctype html/i.test(html) && !/<html\b/i.test(html)) {
    html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body>${html}</body></html>`;
  }
  return html;
}

function getGameRuleContent(gameType: AiMiniAppGameType) {
  if (gameType === 'matching') {
    return {
      label: '配对游戏',
      rules: [
        '先阅读题目，再选择最合适的配对答案。',
        '每题只作答一次，提交后立即显示对错。',
        '每答对 1 题得 1 分，完成后显示总分。',
      ],
      scoring: '评分方式：每题 1 分，满分按题目总数计算。',
    };
  }

  if (gameType === 'sequence') {
    return {
      label: '排序挑战',
      rules: [
        '按任务顺序判断当前题目的最佳步骤。',
        '每题只作答一次，作答后会给出结果反馈。',
        '每答对 1 题得 1 分，完成后显示总分。',
      ],
      scoring: '评分方式：每题 1 分，系统根据总分展示结果。',
    };
  }

  return {
    label: '问答闯关',
    rules: [
      '按顺序完成每一道题目并选择一个答案。',
      '每题只作答一次，提交后立即显示对错。',
      '每答对 1 题得 1 分，完成后显示总分。',
    ],
    scoring: '评分方式：每题 1 分，系统会展示最终得分。',
  };
}

function decorateGeneratedMiniAppHtml(
  rawHtml: string,
  input: {
    title: string;
    gradeLevel: string;
    gameType: AiMiniAppGameType;
  },
): string {
  const html = sanitizeGeneratedHtml(rawHtml);
  const ruleContent = getGameRuleContent(input.gameType);
  const rulesHtml = ruleContent.rules
    .map((rule) => `<li>${escapeHtml(rule)}</li>`)
    .join('');
  const headInjection = `<style>
  .course-miniapp-sidecar{position:fixed;right:18px;bottom:18px;z-index:9999;width:min(320px,calc(100vw - 24px));border-radius:22px;background:rgba(255,250,242,.96);border:1px solid rgba(143,32,23,.2);box-shadow:0 18px 48px rgba(55,28,12,.22);padding:16px;color:#2b1b12;backdrop-filter:blur(10px)}
  .course-miniapp-sidecar__eyebrow{font-size:11px;letter-spacing:.18em;color:#8f2017;opacity:.78}
  .course-miniapp-sidecar__title{margin:6px 0 10px;font-size:18px;font-weight:800}
  .course-miniapp-sidecar__meta{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}
  .course-miniapp-sidecar__pill{border-radius:999px;border:1px solid rgba(143,32,23,.14);background:#fff;padding:6px 10px;font-size:12px;color:#8f2017}
  .course-miniapp-sidecar__rules{margin:0 0 12px;padding-left:18px;font-size:13px;line-height:1.7}
  .course-miniapp-sidecar__score{border-radius:18px;background:linear-gradient(135deg,#8f2017,#4a2218);padding:12px 14px;color:#f8ead1}
  .course-miniapp-sidecar__score-label{font-size:11px;letter-spacing:.16em;opacity:.76}
  .course-miniapp-sidecar__score-value{margin-top:4px;font-size:24px;font-weight:800}
  .course-miniapp-sidecar__score-tip{margin-top:6px;font-size:12px;line-height:1.6;opacity:.88}
  @media (max-width: 720px){.course-miniapp-sidecar{left:12px;right:12px;bottom:12px;width:auto}}
</style>
<script>
(function(){
  if(window.__courseMiniAppBridgeReady){return;}
  window.__courseMiniAppBridgeReady=true;
  window.__courseMiniAppBridgeState={
    score:0,
    total:null,
    status:'ready',
    title:${escapeJsonForScript(input.title)},
    gameType:${escapeJsonForScript(input.gameType)}
  };
  function syncState(type,payload){
    payload=payload||{};
    if(type==='start'){
      window.__courseMiniAppBridgeState.status='playing';
      if(typeof payload.total==='number'){window.__courseMiniAppBridgeState.total=payload.total;}
    }else if(type==='answer'){
      window.__courseMiniAppBridgeState.status='playing';
      if(typeof payload.score==='number'){window.__courseMiniAppBridgeState.score=payload.score;}
      if(typeof payload.total==='number'){window.__courseMiniAppBridgeState.total=payload.total;}
    }else if(type==='complete'){
      window.__courseMiniAppBridgeState.status='completed';
      if(typeof payload.score==='number'){window.__courseMiniAppBridgeState.score=payload.score;}
      if(typeof payload.total==='number'){window.__courseMiniAppBridgeState.total=payload.total;}
      if(typeof payload.durationSeconds==='number'){window.__courseMiniAppBridgeState.durationSeconds=payload.durationSeconds;}
    }
    document.dispatchEvent(new CustomEvent('course-miniapp-event',{detail:{type:type,payload:payload,state:window.__courseMiniAppBridgeState}}));
  }
  window.__courseMiniAppEmit=function(type,payload){
    syncState(type,payload);
    try{window.parent&&window.parent.postMessage({type:'miniapp:event',eventType:type,payload:payload||{}},'*')}catch(e){}
  };
  window.addEventListener('beforeunload',function(){
    try{window.__courseMiniAppEmit('complete',{source:'openmaic',auto:true,score:window.__courseMiniAppBridgeState.score,total:window.__courseMiniAppBridgeState.total})}catch(e){}
  });
})();
</script>`;
  const bodyStartInjection = `<aside class="course-miniapp-sidecar" aria-label="游戏规则与评分">
  <div class="course-miniapp-sidecar__eyebrow">GAME RULES & SCORE</div>
  <div class="course-miniapp-sidecar__title">游戏规则</div>
  <div class="course-miniapp-sidecar__meta">
    <span class="course-miniapp-sidecar__pill">${escapeHtml(ruleContent.label)}</span>
    <span class="course-miniapp-sidecar__pill">学段：${escapeHtml(input.gradeLevel)}</span>
  </div>
  <ul class="course-miniapp-sidecar__rules">${rulesHtml}</ul>
  <div class="course-miniapp-sidecar__score">
    <div class="course-miniapp-sidecar__score-label">当前评分</div>
    <div class="course-miniapp-sidecar__score-value" id="course-miniapp-sidecar-score">0 / --</div>
    <div class="course-miniapp-sidecar__score-tip" id="course-miniapp-sidecar-tip">${escapeHtml(
      ruleContent.scoring,
    )}</div>
  </div>
</aside>`;
  const bodyEndInjection = `<script>
(function(){
  var scoreEl=document.getElementById('course-miniapp-sidecar-score');
  var tipEl=document.getElementById('course-miniapp-sidecar-tip');
  if(!scoreEl||!tipEl){return;}
  function render(state){
    state=state||window.__courseMiniAppBridgeState||{};
    var total=typeof state.total==='number'?state.total:'--';
    var score=typeof state.score==='number'?state.score:0;
    scoreEl.textContent=String(score)+' / '+String(total);
    if(state.status==='completed'&&typeof state.durationSeconds==='number'){
      tipEl.textContent='最终评分：'+String(score)+' / '+String(total)+'，用时 '+String(state.durationSeconds)+' 秒。';
      return;
    }
    tipEl.textContent=${escapeJsonForScript(ruleContent.scoring)};
  }
  document.addEventListener('course-miniapp-event',function(event){
    render(event.detail&&event.detail.state);
  });
  render();
})();
</script>`;

  return html
    .replace(/<\/head>/i, `${headInjection}</head>`)
    .replace(/<body([^>]*)>/i, `<body$1>${bodyStartInjection}`)
    .replace(/<\/body>/i, `${bodyEndInjection}</body>`);
}

function extractOpenMaicHtml(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const content =
    record.content && typeof record.content === 'object'
      ? (record.content as Record<string, unknown>)
      : null;
  const html =
    (content && typeof content.html === 'string' ? content.html : null) ||
    (typeof record.html === 'string' ? record.html : null);

  if (!html || !html.trim()) {
    return null;
  }

  return sanitizeGeneratedHtml(html);
}

function buildOpenMaicOutline(input: {
  title: string;
  prompt: string;
  gradeLevel: string;
  gameType: AiMiniAppGameType;
}) {
  return {
    id: `course-platform-game-${Date.now()}`,
    type: 'interactive',
    title: input.title,
    description: input.prompt,
    keyPoints: [
      `适用学段：${input.gradeLevel}`,
      '生成一个可离线运行的课堂小游戏',
      '必须展示清晰的游戏规则',
      '必须包含明确反馈、评分或完成结果',
      '不要引用外部脚本、外部样式或网络资源',
    ],
    teachingObjective: input.prompt,
    estimatedDuration: 300,
    order: 1,
    widgetType: 'game',
    widgetOutline: {
      gameType: input.gameType,
      challenge: input.prompt,
      playerControls: ['点击选择', '按钮操作'],
      concept: input.title,
    },
  };
}

async function tryGenerateHtmlWithOpenMaic(input: {
  title: string;
  prompt: string;
  gradeLevel: string;
  gameType: AiMiniAppGameType;
  authUserId: string;
}): Promise<{ html: string | null; source: AiMiniAppGenerationSource; error?: string }> {
  const baseUrl = getOpenMaicBaseUrl();
  if (!baseUrl) {
    return { html: null, source: 'template', error: 'OPENMAIC_BASE_URL 未配置' };
  }

  const outline = buildOpenMaicOutline(input);
  const result = await callOpenMaicJson<Record<string, unknown>>({
    authUserId: input.authUserId,
    path: '/api/generate/scene-content',
    method: 'POST',
    timeoutMs: 45000,
    body: {
      outline,
      allOutlines: [outline],
      stageId: `course-platform-${Date.now()}`,
      stageInfo: {
        name: input.title,
        description: input.prompt,
        style: '中小学课堂互动小游戏',
      },
      languageDirective:
        '请使用简体中文。生成内容必须能离线运行，禁止外链脚本、外链样式和外部资源。页面中必须展示游戏规则；评测或答题类互动必须展示评分，并在作答过程中更新分数。请在作答时调用 window.__courseMiniAppEmit("answer",{questionIndex,correct,score,total})，完成时调用 window.__courseMiniAppEmit("complete",{score,total,durationSeconds})。',
    },
  });

  if (!result.ok) {
    return {
      html: null,
      source: 'template',
      error: result.error || 'OpenMAIC 调用失败',
    };
  }

  const html = extractOpenMaicHtml(result.data);
  return html
    ? {
        html: decorateGeneratedMiniAppHtml(html, input),
        source: 'openmaic',
      }
    : { html: null, source: 'template', error: 'OpenMAIC 未返回 HTML' };
}

function buildQuestionSet(gameType: AiMiniAppGameType) {
  if (gameType === 'matching') {
    return [
      { question: '请把“礼”与最接近的含义配对。', options: ['尊重与秩序', '随意打闹', '只看热闹'], answer: 0 },
      { question: '请把“乐”与最接近的含义配对。', options: ['和谐与审美', '沉默不语', '比赛速度'], answer: 0 },
      { question: '开始课堂互动前，最适合先做到什么？', options: ['认真观察并表达', '不听规则', '只追求输赢'], answer: 0 },
    ];
  }

  if (gameType === 'sequence') {
    return [
      { question: '完成课堂小挑战的第一步通常是什么？', options: ['读懂任务', '直接提交', '关闭页面'], answer: 0 },
      { question: '小组合作时，第二步更应该做什么？', options: ['分工讨论', '互相打断', '离开座位'], answer: 0 },
      { question: '最后一步应该是什么？', options: ['复盘收获', '忘记记录', '不看结果'], answer: 0 },
    ];
  }

  return [
    { question: '礼乐学习中，“礼”更强调什么？', options: ['尊重、秩序与规范', '声音越大越好', '只看结果'], answer: 0 },
    { question: '礼乐学习中，“乐”更强调什么？', options: ['和谐、审美与表达', '完全不合作', '只追求速度'], answer: 0 },
    { question: '本节课最应该带走什么？', options: ['知识、体验与表达', '只记住分数', '不用反思'], answer: 0 },
  ];
}

function buildMiniAppHtml(input: {
  title: string;
  prompt: string;
  gradeLevel: string;
  gameType: AiMiniAppGameType;
}) {
  const questions = buildQuestionSet(input.gameType);
  const ruleContent = getGameRuleContent(input.gameType);
  const rulesHtml = ruleContent.rules
    .map((rule) => `<li>${escapeHtml(rule)}</li>`)
    .join('');
  const title = escapeHtml(input.title);
  const gradeLevel = escapeHtml(input.gradeLevel);
  const gameTypeLabel =
    input.gameType === 'matching' ? '配对游戏' : input.gameType === 'sequence' ? '排序挑战' : '问答闯关';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <style>
    *{box-sizing:border-box}body{margin:0;font-family:"Noto Sans SC",system-ui,sans-serif;background:radial-gradient(circle at top,#fff7df,#f1dcc0 42%,#7c241b);color:#2b1b12;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.game{width:min(980px,100%);background:rgba(255,252,246,.94);border:1px solid rgba(143,32,23,.18);border-radius:28px;box-shadow:0 28px 80px rgba(54,28,12,.26);overflow:hidden}.hero{padding:28px;background:linear-gradient(135deg,#8f2017,#4a2218);color:#f8ead1}.eyebrow{font-size:12px;letter-spacing:.22em;opacity:.75}.hero h1{margin:10px 0 0;font-size:30px}.content{padding:26px}.meta{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px}.pill{border:1px solid #e1c79b;background:#fff8eb;border-radius:999px;padding:8px 12px;font-size:13px;color:#8f2017}.overview{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(240px,.7fr);gap:18px;margin-bottom:22px}.rules{border:1px solid #e3cda7;background:#fff8eb;border-radius:24px;padding:20px}.rules h2,.scoreboard h2{margin:0 0 12px;font-size:20px}.rules ul{margin:0;padding-left:18px;line-height:1.8}.scoreboard{border-radius:24px;padding:20px;background:linear-gradient(135deg,#8f2017,#4a2218);color:#f8ead1;display:flex;flex-direction:column;justify-content:space-between}.scoreboard-label{font-size:12px;letter-spacing:.18em;opacity:.76}.scoreboard-value{margin-top:10px;font-size:36px;font-weight:800}.scoreboard-tip{margin-top:12px;font-size:13px;line-height:1.7;opacity:.9}.question{font-size:22px;font-weight:700;line-height:1.45;margin:0 0 18px}.options{display:grid;gap:12px}.option{border:1px solid #dfc69d;background:#fff;border-radius:18px;padding:16px;text-align:left;font-size:16px;cursor:pointer;transition:.18s}.option:hover{transform:translateY(-1px);border-color:#8f2017}.option.correct{border-color:#2f9e44;background:#eaf8ee}.option.wrong{border-color:#d9480f;background:#fff0e6}.footer{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:24px}.score{font-weight:700;color:#8f2017}.next{border:0;background:#8f2017;color:#f8ead1;border-radius:999px;padding:12px 18px;font-weight:700;cursor:pointer}.next:disabled{opacity:.45;cursor:not-allowed}.done{text-align:center;padding:18px}.done h2{font-size:30px;margin:8px 0}.hidden{display:none}@media (max-width: 760px){.overview{grid-template-columns:1fr}.scoreboard-value{font-size:30px}}
  </style>
</head>
<body>
  <main class="game">
    <section class="hero">
      <div class="eyebrow">AI MINI GAME · ${escapeHtml(gameTypeLabel)}</div>
      <h1>${title}</h1>
    </section>
    <section class="content">
      <div class="meta"><span class="pill">学段：${gradeLevel}</span><span class="pill">共 <span id="total"></span> 题</span><span class="pill">完成后自动上报课堂事件</span></div>
      <div class="overview">
        <section class="rules">
          <h2>游戏规则</h2>
          <ul>${rulesHtml}</ul>
        </section>
        <section class="scoreboard">
          <div>
            <div class="scoreboard-label">当前评分</div>
            <div class="scoreboard-value" id="scoreboard-value">0 / ${questions.length}</div>
          </div>
          <div class="scoreboard-tip" id="scoreboard-tip">${escapeHtml(
            ruleContent.scoring,
          )}</div>
        </section>
      </div>
      <div id="play">
        <p class="question" id="question"></p>
        <div class="options" id="options"></div>
        <div class="footer"><div class="score" id="score"></div><button class="next" id="next" disabled>下一题</button></div>
      </div>
      <div id="done" class="done hidden">
        <div class="eyebrow">CHALLENGE COMPLETED</div>
        <h2>挑战完成！</h2>
        <p id="summary"></p>
        <button class="next" onclick="location.reload()">再玩一次</button>
      </div>
    </section>
  </main>
<script>
const questions=${escapeJsonForScript(questions)};
let index=0;let score=0;let answered=false;const startedAt=Date.now();
const totalEl=document.getElementById('total');const questionEl=document.getElementById('question');const optionsEl=document.getElementById('options');const scoreEl=document.getElementById('score');const scoreBoardValueEl=document.getElementById('scoreboard-value');const scoreBoardTipEl=document.getElementById('scoreboard-tip');const nextBtn=document.getElementById('next');const playEl=document.getElementById('play');const doneEl=document.getElementById('done');const summaryEl=document.getElementById('summary');
totalEl.textContent=questions.length;
function emit(type,payload){try{window.parent&&window.parent.postMessage({type:'miniapp:event',eventType:type,payload},'*')}catch(e){}}
function syncScoreBoard(message){scoreBoardValueEl.textContent=score+' / '+questions.length;if(message){scoreBoardTipEl.textContent=message;}}
function render(){answered=false;nextBtn.disabled=true;const item=questions[index];questionEl.textContent=(index+1)+'. '+item.question;scoreEl.textContent='得分 '+score+' / '+questions.length;syncScoreBoard(${escapeJsonForScript(ruleContent.scoring)});optionsEl.innerHTML='';item.options.forEach((option,optionIndex)=>{const button=document.createElement('button');button.className='option';button.textContent=option;button.onclick=()=>choose(button,optionIndex);optionsEl.appendChild(button);});}
function choose(button,optionIndex){if(answered)return;answered=true;const item=questions[index];const correct=optionIndex===item.answer;if(correct)score+=1;Array.from(optionsEl.children).forEach((node,nodeIndex)=>{node.disabled=true;if(nodeIndex===item.answer)node.classList.add('correct');if(nodeIndex===optionIndex&&!correct)node.classList.add('wrong');});scoreEl.textContent='得分 '+score+' / '+questions.length;syncScoreBoard(correct?'本题得分 1 分，继续下一题。':'本题未得分，继续下一题。');nextBtn.disabled=false;emit('answer',{questionIndex:index,correct,score,total:questions.length});}
nextBtn.onclick=()=>{index+=1;if(index>=questions.length){finish();return;}render();};
function finish(){playEl.classList.add('hidden');doneEl.classList.remove('hidden');const durationSeconds=Math.round((Date.now()-startedAt)/1000);summaryEl.textContent='本次得分 '+score+' / '+questions.length+'，用时 '+durationSeconds+' 秒。';syncScoreBoard('最终评分：'+score+' / '+questions.length+'，用时 '+durationSeconds+' 秒。');emit('complete',{score,total:questions.length,durationSeconds});}
emit('start',{title:${escapeJsonForScript(input.title)},gameType:${escapeJsonForScript(input.gameType)}});render();
</script>
</body>
</html>`;
}

async function createZipBuffer(files: Record<string, string>): Promise<Buffer> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ai-miniapp-'));
  const zipPath = path.join(tempDir, 'bundle.zip');

  try {
    await Promise.all(
      Object.entries(files).map(([fileName, content]) => writeFile(path.join(tempDir, fileName), content)),
    );

    const result = spawnSync(
      'python3',
      [
        '-c',
        'import sys, zipfile\nzip_path = sys.argv[1]\nfiles = sys.argv[2:]\nwith zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:\n    for name in files:\n        archive.write(name, name)',
        zipPath,
        ...Object.keys(files),
      ],
      {
        cwd: tempDir,
        encoding: 'utf8',
      },
    );

    if (result.status !== 0) {
      throw new Error(result.stderr || '压缩小游戏失败');
    }

    const { readFile } = await import('fs/promises');
    return readFile(zipPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function normalizeAiMiniAppInput(body: Record<string, unknown> | null) {
  const prompt = normalizeText(body?.prompt, '').slice(0, 800);
  const generatedTitle =
    normalizeText(body?.title, '').slice(0, 80) ||
    getDefaultAiMiniAppTitle(normalizeGameType(body?.gameType ?? body?.game_type));

  return {
    title: generatedTitle,
    prompt,
    gradeLevel: normalizeText(body?.gradeLevel ?? body?.grade_level, '小学').slice(0, 40),
    gameType: normalizeGameType(body?.gameType ?? body?.game_type),
    previewOnly: body?.previewOnly === true,
    providedHtml:
      typeof body?.html === 'string' && body.html.trim() ? body.html.trim() : '',
    providedGenerationSource:
      (body?.generationSource === 'openmaic' ? 'openmaic' : 'template') as AiMiniAppGenerationSource,
    providedOpenMaicError:
      typeof body?.openMaicError === 'string' && body.openMaicError.trim()
        ? body.openMaicError.trim()
        : null,
  };
}

export async function generateAiMiniAppPreview(input: {
  title: string;
  prompt: string;
  gradeLevel: string;
  gameType: AiMiniAppGameType;
  authUserId: string;
  providedHtml?: string;
  providedGenerationSource?: AiMiniAppGenerationSource;
  providedOpenMaicError?: string | null;
}): Promise<AiMiniAppPreviewPayload> {
  const openMaicResult = input.providedHtml
    ? {
        html: input.providedHtml,
        source: input.providedGenerationSource || 'template',
        error: input.providedOpenMaicError || undefined,
      }
    : await tryGenerateHtmlWithOpenMaic({
        title: input.title,
        prompt: input.prompt,
        gradeLevel: input.gradeLevel,
        gameType: input.gameType,
        authUserId: input.authUserId,
      });

  const html =
    openMaicResult.html ||
    buildMiniAppHtml({
      title: input.title,
      prompt: input.prompt,
      gradeLevel: input.gradeLevel,
      gameType: input.gameType,
    });

  return {
    title: input.title,
    prompt: input.prompt,
    gradeLevel: input.gradeLevel,
    gameType: input.gameType,
    html,
    generationSource: openMaicResult.source,
    openMaicError: openMaicResult.error || null,
  };
}

export async function publishAiMiniApp(input: {
  authUserId: string;
  title: string;
  prompt: string;
  gradeLevel: string;
  gameType: AiMiniAppGameType;
  html: string;
  generationSource: AiMiniAppGenerationSource;
  openMaicError?: string | null;
}) {
  const userModelConfig = await getDefaultAiModelConfig(input.authUserId);
  const suffix = randomUUID().slice(0, 8);
  const appKey = `${slugifyTitle(input.title)}-${suffix}`.slice(0, 64);
  const version = `v${Date.now()}`;
  const manifest = {
    name: input.title,
    description: input.prompt,
    generatedBy:
      input.generationSource === 'openmaic'
        ? 'openmaic'
        : 'course-platform-ai-studio',
    openMaicError: input.openMaicError || null,
    userModelConfigured: Boolean(userModelConfig),
    gameType: input.gameType,
    gradeLevel: input.gradeLevel,
    entry: 'index.html',
    eventProtocol: ['start', 'answer', 'complete'],
  };

  const zipBuffer = await createZipBuffer({
    'index.html': input.html,
    'manifest.json': `${JSON.stringify(manifest, null, 2)}\n`,
  });

  const published = await publishMiniAppZip({
    appKey,
    version,
    zipBuffer,
    entryFile: 'index.html',
    overwrite: false,
  });

  const miniApp = await createMiniApp({
    appKey,
    name: input.title,
    description: input.prompt,
    category: 'AI 生成',
    vendorName: 'OpenMAIC 集成',
    sourceType: 'local',
    status: 'published',
  });

  const miniAppVersion = await createMiniAppVersion({
    miniAppId: miniApp.id,
    version,
    entryUrl: published.entryUrl,
    sourceType: 'local',
    manifest,
    releaseNotes: 'AI 创作工坊生成的小游戏草稿',
    publish: true,
  });

  return {
    miniApp,
    version: miniAppVersion,
    generationSource: input.generationSource,
    openMaicError: input.openMaicError || null,
  };
}
