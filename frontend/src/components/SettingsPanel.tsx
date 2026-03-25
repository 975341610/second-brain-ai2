import { Database, Settings2, Folder, RefreshCw, Terminal, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import type { ModelConfig } from '../lib/types';
import { api } from '../lib/api';

type SettingsPanelProps = {
  modelConfig: ModelConfig;
  onUpdateModelConfig: (payload: ModelConfig) => Promise<void>;
};

export function SettingsPanel({ modelConfig, onUpdateModelConfig }: SettingsPanelProps) {
  const [config, setConfig] = useState(modelConfig);
  const [dataPath, setDataPath] = useState('');
  const [importPath, setImportPath] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'up-to-date' | 'pending' | 'updating' | 'success' | 'error'>('idle');
  const [updateOutput, setUpdateOutput] = useState('');
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setConfig(modelConfig);
  }, [modelConfig]);

  // 定期拉取日志
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await api.getSystemLogs();
        if (res.logs.length > 0) {
          setLogs(prev => [...prev, ...res.logs].slice(-500));
        }
      } catch (e) {
        console.error('Failed to fetch logs', e);
      }
    };
    const timer = setInterval(fetchLogs, 2000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const handleCheck = async () => {
    setIsUpdating(true);
    setUpdateStatus('checking');
    setUpdateOutput('');
    try {
      const res = await api.checkUpdate();
      setUpdateOutput(res.output);
      setUpdateStatus(res.status as any);
    } catch (e: any) {
      setUpdateOutput(e.message);
      setUpdateStatus('error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePerformUpdate = async () => {
    setIsUpdating(true);
    setUpdateStatus('updating');
    try {
      const res = await api.performUpdate();
      setUpdateOutput(res.output);
      setUpdateStatus(res.status === 'ok' ? 'success' : 'error');
    } catch (e: any) {
      setUpdateOutput(e.message);
      setUpdateStatus('error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRestart = async () => {
    try {
      await api.restartApp();
      alert('应用正在通过 fast_update.bat 重启并更新，请稍候...');
    } catch (e: any) {
      alert('重启失败: ' + e.message);
    }
  };

  const handleUpdateDataPath = async () => {
    if (!dataPath) return;
    try {
      const res = await api.updateDataPath(dataPath);
      alert(res.message);
    } catch (e: any) {
      alert('更新路径失败: ' + e.message);
    }
  };

  const handleImportData = async () => {
    if (!importPath) return;
    const confirmed = window.confirm('危险操作：此操作将不可逆地覆盖当前所有数据！\n确定要继续吗？');
    if (!confirmed) return;

    try {
      const res = await api.importData(importPath);
      alert('数据导入成功！请彻底关闭并重新启动软件以生效。');
    } catch (e: any) {
      alert('数据导入失败: ' + e.message);
    }
  };

  return (
    <section className="space-y-6">
      <div className="rounded-[28px] border border-white/50 bg-[rgba(255,252,247,0.88)] p-6 shadow-soft backdrop-blur">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-2xl bg-stone-900 p-3 text-white"><Settings2 size={18} /></div>
          <div>
            <div className="text-lg font-medium text-stone-900">设置</div>
            <div className="text-sm text-stone-500">在这里统一管理模型、导入和工作区设置。</div>
          </div>
        </div>
        
        <div className="grid gap-6 xl:grid-cols-2">
          {/* 模型设置 */}
          <div className="rounded-[24px] bg-white/85 p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-stone-500"><Database size={16} /> 模型设置</div>
            <div className="space-y-3">
              <input value={config.provider} onChange={(e) => setConfig({ ...config, provider: e.target.value })} className="w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm" placeholder="服务商" />
              <input value={config.model_name} onChange={(e) => setConfig({ ...config, model_name: e.target.value })} className="w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm" placeholder="模型名称" />
              <input value={config.base_url} onChange={(e) => setConfig({ ...config, base_url: e.target.value })} className="w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm" placeholder="接口地址 (需包含 /v1)" />
              <input value={config.api_key} onChange={(e) => setConfig({ ...config, api_key: e.target.value })} className="w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm" placeholder="API Key" />
              <button onClick={() => onUpdateModelConfig(config)} className="w-full rounded-2xl bg-stone-900 px-4 py-3 text-sm font-medium text-white hover:bg-stone-800 transition-colors">保存设置</button>
            </div>
          </div>

          {/* 数据存储设置 */}
          <div className="rounded-[24px] bg-white/85 p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-stone-500"><Folder size={16} /> 数据存储</div>
            <div className="space-y-3">
              <div className="text-xs text-stone-400 mb-1">自定义数据存储路径 (Data Path Override)</div>
              <input 
                value={dataPath} 
                onChange={(e) => setDataPath(e.target.value)} 
                className="w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm" 
                placeholder="例如: D:\SecondBrainData" 
              />
              <button 
                onClick={handleUpdateDataPath} 
                className="w-full rounded-2xl border border-stone-900 px-4 py-3 text-sm font-medium text-stone-900 hover:bg-stone-50 transition-colors"
              >
                更新路径并迁移数据
              </button>
              <div className="text-[11px] text-stone-400 leading-relaxed italic">
                * 修改后需要重启应用。程序会尝试将现有数据移动到新位置。
              </div>
            </div>
          </div>

          {/* 数据导入设置 */}
          <div className="rounded-[24px] bg-white/85 p-5 border-2 border-red-100">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-red-500"><AlertTriangle size={16} /> 数据导入</div>
            <div className="space-y-3">
              <div className="text-xs text-red-400 mb-1 font-bold">从本地目录导入并覆盖数据</div>
              <input 
                value={importPath} 
                onChange={(e) => setImportPath(e.target.value)} 
                className="w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm focus:border-red-300" 
                placeholder="数据备份所在的绝对路径" 
              />
              <button 
                onClick={handleImportData} 
                className="w-full rounded-2xl bg-red-500 px-4 py-3 text-sm font-medium text-white hover:bg-red-600 transition-colors shadow-sm"
              >
                导入并完全覆盖当前数据
              </button>
              <div className="text-[11px] text-red-400 leading-relaxed italic font-medium">
                * 警告：此操作不可逆！导入前将自动断开当前数据库。完成后请手动重启软件。
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 系统日志与更新 */}
      <div className="rounded-[28px] border border-white/50 bg-[rgba(255,252,247,0.88)] p-6 shadow-soft backdrop-blur">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-stone-900 p-3 text-white"><Terminal size={18} /></div>
            <div>
              <div className="text-lg font-medium text-stone-900">系统日志与更新</div>
              <div className="text-sm text-stone-500">查看运行状态并获取最新功能。</div>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={handleCheck} 
              disabled={isUpdating}
              className="flex items-center gap-2 rounded-2xl bg-stone-100 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-200 transition-all disabled:opacity-50"
            >
              <RefreshCw size={14} className={isUpdating && updateStatus === 'checking' ? 'animate-spin' : ''} />
              {isUpdating && updateStatus === 'checking' ? '检查中...' : '检查更新'}
            </button>
            
            {/* 发现新版本 → 显示确认更新按钮 */}
            {updateStatus === 'pending' && (
              <button 
                onClick={handlePerformUpdate} 
                disabled={isUpdating}
                className="flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-all disabled:opacity-50"
              >
                <RefreshCw size={14} className={isUpdating ? 'animate-spin' : ''} />
                {isUpdating ? '更新中...' : '确认更新'}
              </button>
            )}
            
            {/* 更新成功 → 显示重启按钮 */}
            {updateStatus === 'success' && (
              <button 
                onClick={handleRestart} 
                className="flex items-center gap-2 rounded-2xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-all"
              >
                <CheckCircle2 size={14} />
                重启并应用
              </button>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {updateStatus !== 'idle' && updateOutput && (
            <div className={`rounded-2xl p-4 text-xs font-mono whitespace-pre-wrap ${
              updateStatus === 'error' ? 'bg-red-50 text-red-600' : 
              updateStatus === 'up-to-date' ? 'bg-green-50 text-green-700' :
              updateStatus === 'pending' ? 'bg-blue-50 text-blue-700' :
              'bg-stone-50 text-stone-600'
            }`}>
              <div className="mb-2 font-bold flex items-center gap-2">
                {updateStatus === 'error' ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
                {updateStatus === 'up-to-date' ? '已是最新版本' : 
                 updateStatus === 'pending' ? '发现新版本' :
                 updateStatus === 'success' ? '更新成功' : 
                 updateStatus === 'error' ? '操作失败' : 'Update Result:'}
              </div>
              {updateOutput}
            </div>
          )}

          <div 
            ref={logContainerRef}
            className="h-64 overflow-y-auto rounded-[24px] bg-stone-900 p-4 font-mono text-xs text-stone-300 shadow-inner scroll-smooth"
          >
            <div className="space-y-1">
              {logs.map((log, i) => (
                <div key={i} className="opacity-90">{log}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
