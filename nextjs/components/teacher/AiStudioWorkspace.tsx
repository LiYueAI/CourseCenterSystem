'use client';

import { useEffect, useState } from 'react';
import AiMiniAppGenerator from './AiMiniAppGenerator';
import OpenMaicToolsPanel from './OpenMaicToolsPanel';
import ScriptGenerationAssistant from './ScriptGenerationAssistant';
import { getModules, type Lesson, type LessonModule } from '@/lib/directus';

interface AiStudioWorkspaceProps {
  initialLessons: Lesson[];
}

export default function AiStudioWorkspace({ initialLessons }: AiStudioWorkspaceProps) {
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(initialLessons[0]?.id || null);
  const [modules, setModules] = useState<LessonModule[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<number | null>(null);
  const [loadingModules, setLoadingModules] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);


  useEffect(() => {
    async function loadModules() {
      if (!selectedLessonId) {
        setModules([]);
        setSelectedModuleId(null);
        return;
      }
      setLoadingModules(true);
      try {
        const moduleData = await getModules(selectedLessonId);
        setModules(moduleData);
        setSelectedModuleId(moduleData[0]?.id || null);
      } catch {
        setModules([]);
        setSelectedModuleId(null);
      } finally {
        setLoadingModules(false);
      }
    }
    void loadModules();
  }, [selectedLessonId]);

  return (
    <section className="space-y-6">
      <div className="portal-panel p-5 md:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-stone-700">
            课时
            <select
              value={selectedLessonId || ''}
              onChange={(event) => setSelectedLessonId(Number(event.target.value) || null)}
              className="rounded-2xl border border-[#d9c29b]/70 bg-white px-4 py-3 outline-none focus:border-[#8f2017]"
            >
              {initialLessons.length === 0 ? <option value="">暂无课时</option> : null}
              {initialLessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>{lesson.title}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium text-stone-700">
            流程
            <select
              value={selectedModuleId || ''}
              onChange={(event) => setSelectedModuleId(Number(event.target.value) || null)}
              disabled={loadingModules || modules.length === 0}
              className="rounded-2xl border border-[#d9c29b]/70 bg-white px-4 py-3 outline-none focus:border-[#8f2017] disabled:opacity-60"
            >
              {loadingModules ? <option value="">正在读取流程...</option> : null}
              {!loadingModules && modules.length === 0 ? <option value="">暂无流程</option> : null}
              {modules.map((module) => (
                <option key={module.id} value={module.id}>{module.module_name || module.module_type || `流程 ${module.module_index}`}</option>
              ))}
            </select>
          </label>
        </div>
        {feedback ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{feedback}</div> : null}
      </div>

      <section id="script-assistant" className="scroll-mt-24">
        <ScriptGenerationAssistant
          lessonId={selectedLessonId}
          moduleId={selectedModuleId}
          onResourceCreated={(resource) => setFeedback(`已保存资源「${resource.title}」。`)}
        />
      </section>

      <section id="miniapp-generator" className="scroll-mt-24">
        <AiMiniAppGenerator
          fixedLessonId={selectedLessonId}
          fixedModuleId={selectedModuleId}
          onGenerated={(resource) => setFeedback(`已生成小游戏资源「${resource.title}」。`)}
        />
      </section>

      <section id="tools-panel" className="scroll-mt-24">
        <OpenMaicToolsPanel
          lessonId={selectedLessonId}
          moduleId={selectedModuleId}
          lessonTitle={initialLessons.find((lesson) => lesson.id === selectedLessonId)?.title}
          moduleName={modules.find((module) => module.id === selectedModuleId)?.module_name || undefined}
          onResourceCreated={(resource) => setFeedback(`已保存资源「${resource.title}」。`)}
        />
      </section>
    </section>
  );
}
