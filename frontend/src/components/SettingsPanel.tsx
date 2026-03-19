import { Database, Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ModelConfig } from '../lib/types';

type SettingsPanelProps = {
  modelConfig: ModelConfig;
  onUpdateModelConfig: (payload: ModelConfig) => Promise<void>;
};

export function SettingsPanel({ modelConfig, onUpdateModelConfig }: SettingsPanelProps) {
  const [config, setConfig] = useState(modelConfig);

  useEffect(() => {
    setConfig(modelConfig);
  }, [modelConfig]);

  return (
    <section className="rounded-[28px] border border-white/50 bg-[rgba(255,252,247,0.88)] p-6 shadow-soft backdrop-blur">
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-2xl bg-stone-900 p-3 text-white"><Settings2 size={18} /></div>
        <div>
          <div className="text-lg font-medium text-stone-900">设置</div>
          <div className="text-sm text-stone-500">在这里统一管理模型、导入和工作区设置。</div>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[24px] bg-white/85 p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-stone-500"><Database size={16} /> 模型设置</div>
          <div className="space-y-3">
            <input value={config.provider} onChange={(e) => setConfig({ ...config, provider: e.target.value })} className="w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm" placeholder="服务商" />
            <input value={config.model_name} onChange={(e) => setConfig({ ...config, model_name: e.target.value })} className="w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm" placeholder="模型名称" />
            <input value={config.base_url} onChange={(e) => setConfig({ ...config, base_url: e.target.value })} className="w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm" placeholder="接口地址" />
            <input value={config.api_key} onChange={(e) => setConfig({ ...config, api_key: e.target.value })} className="w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm" placeholder="API Key" />
            <button onClick={() => onUpdateModelConfig(config)} className="w-full rounded-2xl bg-stone-900 px-4 py-3 text-sm font-medium text-white">保存设置</button>
          </div>
        </div>
        <div className="rounded-[24px] bg-white/85 p-5">
          <div className="mb-3 text-sm font-medium text-stone-500">导入与预览说明</div>
          <div className="space-y-3 text-sm leading-7 text-stone-600">
            <p>支持 Markdown、图片、音视频链接、本地媒体 Data URL、代码块、表格和引用语法。</p>
            <p>推荐使用 `#` 标题生成目录，使用 `[[笔记名]]` 建立笔记间引用。</p>
            <p>如果配置了远程模型，这里的设置会覆盖默认本地离线回退逻辑。</p>
          </div>
        </div>
      </div>
    </section>
  );
}
