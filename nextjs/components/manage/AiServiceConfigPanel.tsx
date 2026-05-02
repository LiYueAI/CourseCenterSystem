'use client';

import { useState } from 'react';
import { Cpu, Image, Video, Sparkles, Save, TestTube2 } from 'lucide-react';

type ServiceType = 'llm' | 'image' | 'video' | 'other';

interface ServiceConfig {
  type: ServiceType;
  name: string;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

const SERVICE_TYPES = [
  { type: 'llm' as ServiceType, label: '大语言模型', icon: Cpu },
  { type: 'image' as ServiceType, label: '生图服务', icon: Image },
  { type: 'video' as ServiceType, label: '生视频服务', icon: Video },
  { type: 'other' as ServiceType, label: '其他服务', icon: Sparkles },
];

export default function AiServiceConfigPanel() {
  const [activeType, setActiveType] = useState<ServiceType>('llm');
  const [configs, setConfigs] = useState<Record<ServiceType, ServiceConfig>>({
    llm: {
      type: 'llm',
      name: '大语言模型',
      providerName: 'OpenAI Compatible',
      baseUrl: '',
      apiKey: '',
      model: '',
    },
    image: {
      type: 'image',
      name: '生图服务',
      providerName: '',
      baseUrl: '',
      apiKey: '',
      model: '',
    },
    video: {
      type: 'video',
      name: '生视频服务',
      providerName: '',
      baseUrl: '',
      apiKey: '',
      model: '',
    },
    other: {
      type: 'other',
      name: '其他服务',
      providerName: '',
      baseUrl: '',
      apiKey: '',
      model: '',
    },
  });

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const activeConfig = configs[activeType];

  const handleInputChange = (field: keyof ServiceConfig, value: string) => {
    setConfigs((prev) => ({
      ...prev,
      [activeType]: {
        ...prev[activeType],
        [field]: value,
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 800));
      alert('配置已保存');
    } catch (error) {
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      alert('连接测试成功');
    } catch (error) {
      alert('连接测试失败');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="portal-panel overflow-hidden">
        <div className="flex gap-2 border-b border-[#d9c29b]/45 bg-[linear-gradient(180deg,rgba(255,251,244,0.94),rgba(247,238,224,0.92))] p-4">
          {SERVICE_TYPES.map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              onClick={() => setActiveType(type)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                activeType === type
                  ? 'bg-[#8f2017] text-white'
                  : 'bg-white/60 text-stone-600 hover:bg-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="p-6">
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">
                服务商名称
              </label>
              <input
                type="text"
                value={activeConfig.providerName}
                onChange={(e) => handleInputChange('providerName', e.target.value)}
                placeholder="例如：OpenAI、Azure、阿里云"
                className="w-full rounded-xl border border-[#d9c29b]/55 bg-white/90 px-4 py-2.5 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">
                Base URL
              </label>
              <input
                type="text"
                value={activeConfig.baseUrl}
                onChange={(e) => handleInputChange('baseUrl', e.target.value)}
                placeholder="https://api.example.com/v1"
                className="w-full rounded-xl border border-[#d9c29b]/55 bg-white/90 px-4 py-2.5 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">
                API Key
              </label>
              <input
                type="password"
                value={activeConfig.apiKey}
                onChange={(e) => handleInputChange('apiKey', e.target.value)}
                placeholder="sk-..."
                className="w-full rounded-xl border border-[#d9c29b]/55 bg-white/90 px-4 py-2.5 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">
                模型名称
              </label>
              <input
                type="text"
                value={activeConfig.model}
                onChange={(e) => handleInputChange('model', e.target.value)}
                placeholder="gpt-4, claude-3-opus, dall-e-3"
                className="w-full rounded-xl border border-[#d9c29b]/55 bg-white/90 px-4 py-2.5 text-sm text-stone-700 outline-none transition-colors focus:border-[#c58d3e]"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-full border border-[#d9c29b]/55 bg-[#8f2017] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#6d1812] disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? '保存中...' : '保存配置'}
              </button>
              <button
                onClick={handleTest}
                disabled={testing}
                className="flex items-center gap-2 rounded-full border border-[#d9c29b]/55 bg-white px-5 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-[#fffaf0] disabled:opacity-50"
              >
                <TestTube2 className="h-4 w-4" />
                {testing ? '测试中...' : '测试连接'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
