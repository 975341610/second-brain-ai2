import { Database, HardDrive, Lock, Palette, Puzzle, RefreshCcw, Settings2, Upload } from 'lucide-react';

import { useEffect, useState } from 'react';
import type { AppInfo, CustomThemeTokens, HomeLayoutItem, ModelConfig, NoteTemplate, PluginManifest, PrivateVaultStatus, UpdateAvailability, UpdateState, WorkspaceSettingsData } from '../lib/types';

import { DEFAULT_CUSTOM_THEME, DEFAULT_HOME_LAYOUT, DEFAULT_WORKSPACE_SETTINGS } from '../lib/types';

type SettingsPanelProps = {
  appInfo: AppInfo;
  modelConfig: ModelConfig;
  templates: NoteTemplate[];
  plugins: PluginManifest[];
  workspaceSettings: WorkspaceSettingsData;
  privateVault: PrivateVaultStatus;
  updateState: UpdateState;
  updateAvailability: UpdateAvailability;
  onUpdateModelConfig: (payload: ModelConfig) => Promise<void>;
  onUpdateWorkspaceSettings: (payload: WorkspaceSettingsData) => Promise<void>;
  onUnlockPrivateVault: (passphrase: string) => Promise<void>;
  onLockPrivateVault: () => Promise<void>;
  onSaveTemplate: (payload: { id?: number; name: string; description?: string; icon?: string; note_type?: string; default_title?: string; default_content?: string; metadata?: Record<string, unknown> }) => Promise<void>;
  onDeleteTemplate: (templateId: number) => Promise<void>;
  onCheckUpdateAvailability: () => Promise<void>;
  onUploadOfflineUpdate: (file: File) => Promise<void>;
  onStageUpdatePackage: (payload: { current_version?: string; staged_version?: string; package_path?: string; package_kind?: string; status?: string; manifest?: Record<string, unknown> }) => Promise<void>;
  onApplyUpdatePackage: () => Promise<void>;
  onRollbackUpdatePackage: () => Promise<void>;
};

const boardLabels: Record<HomeLayoutItem['id'], string> = {
  recent_notes: '最近访问的笔记',
  task_board: '任务看板',
  assistant: 'AI 助手',
  knowledge_cards: '知识卡片',
};

const themePresets: Record<Exclude<WorkspaceSettingsData['theme_mode'], 'custom'>, { name: string; colors: CustomThemeTokens }> = {
  warm: {
    name: '琥珀森林',
    colors: {
      paper: '#f7f1e4',
      panel_bg: '#fffcf7',
      surface_bg: '#ffffff',
      border_color: '#d6d3d1',
      text_primary: '#2d261c',
      text_secondary: '#6b665d',
      text_muted: '#a8a29e',
      accent_strong: '#1c1917',
      accent_contrast: '#ffffff',
    },
  },
  forest: {
    name: '森林晨雾',
    colors: {
      paper: '#edf7f1',
      panel_bg: '#f4fcf7',
      surface_bg: '#ffffff',
      border_color: '#bbf7d0',
      text_primary: '#193127',
      text_secondary: '#35614e',
      text_muted: '#6b8a7c',
      accent_strong: '#166534',
      accent_contrast: '#ffffff',
    },
  },
  night: {
    name: '深夜蓝调',
    colors: {
      paper: '#0f172a',
      panel_bg: '#0f172a',
      surface_bg: '#1e293b',
      border_color: '#475569',
      text_primary: '#e5eefb',
      text_secondary: '#cbd5e1',
      text_muted: '#94a3b8',
      accent_strong: '#38bdf8',
      accent_contrast: '#082f49',
    },
  },
};

const themeColorFields: Array<{ key: keyof CustomThemeTokens; label: string }> = [
  { key: 'paper', label: '页面底色' },
  { key: 'panel_bg', label: '面板背景' },
  { key: 'surface_bg', label: '卡片背景' },
  { key: 'border_color', label: '边框颜色' },
  { key: 'text_primary', label: '主文字' },
  { key: 'text_secondary', label: '次文字' },
  { key: 'text_muted', label: '弱文字' },
  { key: 'accent_strong', label: '强调色' },
  { key: 'accent_contrast', label: '强调字色' },
];

export function SettingsPanel({
  appInfo,
  modelConfig,
  templates,
  plugins,
  workspaceSettings,
  privateVault,
  updateState,
  updateAvailability,
  onUpdateModelConfig,
  onUpdateWorkspaceSettings,
  onUnlockPrivateVault,
  onLockPrivateVault,
  onSaveTemplate,
  onDeleteTemplate,
  onCheckUpdateAvailability,
  onUploadOfflineUpdate,
  onStageUpdatePackage,
  onApplyUpdatePackage,
  onRollbackUpdatePackage,
}: SettingsPanelProps) {
  const [config, setConfig] = useState(modelConfig);
  const [themeName, setThemeName] = useState(workspaceSettings.theme_name);
  const [themeMode, setThemeMode] = useState(workspaceSettings.theme_mode);
  const [wallpaper, setWallpaper] = useState(workspaceSettings.wallpaper);
  const [fontMode, setFontMode] = useState(workspaceSettings.font_mode);
  const [motionMode, setMotionMode] = useState(workspaceSettings.motion_mode);
  const [density, setDensity] = useState(workspaceSettings.density);
  const [homeLayout, setHomeLayout] = useState<HomeLayoutItem[]>(workspaceSettings.home_layout);
  const [customTheme, setCustomTheme] = useState<CustomThemeTokens>(workspaceSettings.custom_theme);
  const [templateName, setTemplateName] = useState('每日子弹笔记');
  const [templateContent, setTemplateContent] = useState('<h1>今日记录</h1><ul><li>[ ] 任务</li><li>• 事件</li><li>- 想法</li></ul>');
  const [templateType, setTemplateType] = useState('bullet_journal');
  const [passphrase, setPassphrase] = useState('');
  const [packageKind, setPackageKind] = useState(String(updateState.package_kind || 'portable_zip'));
  const [stagedVersion, setStagedVersion] = useState(String(updateState.staged_version || updateAvailability.latest_version || appInfo.version || ''));
  const [pluginItems, setPluginItems] = useState<PluginManifest[]>(plugins);
  const [selectedPackageName, setSelectedPackageName] = useState('');

  useEffect(() => {
    setConfig(modelConfig);
  }, [modelConfig]);

  useEffect(() => {
    setThemeName(workspaceSettings.theme_name);
    setThemeMode(workspaceSettings.theme_mode);
    setWallpaper(workspaceSettings.wallpaper);
    setFontMode(workspaceSettings.font_mode);
    setMotionMode(workspaceSettings.motion_mode);
    setDensity(workspaceSettings.density);
    setHomeLayout(workspaceSettings.home_layout);
    setCustomTheme(workspaceSettings.custom_theme);
  }, [workspaceSettings]);

  useEffect(() => {
    setPluginItems(plugins);
  }, [plugins]);

  useEffect(() => {
    setPackageKind(String(updateState.package_kind || 'portable_zip'));
    setStagedVersion(String(updateState.staged_version || updateAvailability.latest_version || appInfo.version || ''));
    const packagePath = String(updateState.package_path || '');
    setSelectedPackageName(packagePath ? packagePath.split(/[/\\]/).pop() || '' : '');
  }, [appInfo.version, updateState, updateAvailability.latest_version]);

  const saveWorkspaceAppearance = () => onUpdateWorkspaceSettings({
    ...workspaceSettings,
    theme_name: themeName,
    theme_mode: themeMode,
    wallpaper,
    font_mode: fontMode,
    motion_mode: motionMode,
    density,
    home_layout: homeLayout,
    custom_theme: customTheme,
    enabled_plugins: pluginItems.filter((plugin) => plugin.enabled).map((plugin) => plugin.id),
  });

  const moveLayoutItem = (id: HomeLayoutItem['id'], direction: 'up' | 'down') => {
    setHomeLayout((current) => {
      const next = [...current];
      const index = next.findIndex((item) => item.id === id);
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      if (index === -1 || swapIndex < 0 || swapIndex >= next.length) return current;
      [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
      return next;
    });
  };

  const toggleLayoutItemVisibility = (id: HomeLayoutItem['id']) => {
    setHomeLayout((current) => current.map((item) => item.id === id ? { ...item, visible: !item.visible } : item));
  };

  const resetWorkspaceAppearance = () => {
    setThemeName(DEFAULT_WORKSPACE_SETTINGS.theme_name);
    setThemeMode(DEFAULT_WORKSPACE_SETTINGS.theme_mode);
    setWallpaper(DEFAULT_WORKSPACE_SETTINGS.wallpaper);
    setFontMode(DEFAULT_WORKSPACE_SETTINGS.font_mode);
    setMotionMode(DEFAULT_WORKSPACE_SETTINGS.motion_mode);
    setDensity(DEFAULT_WORKSPACE_SETTINGS.density);
    setHomeLayout(DEFAULT_HOME_LAYOUT.map((item) => ({ ...item })));
    setCustomTheme({ ...DEFAULT_CUSTOM_THEME });
  };

  const resetThemeAppearance = () => {
    setThemeName(DEFAULT_WORKSPACE_SETTINGS.theme_name);
    setThemeMode(DEFAULT_WORKSPACE_SETTINGS.theme_mode);
    setWallpaper(DEFAULT_WORKSPACE_SETTINGS.wallpaper);
    setFontMode(DEFAULT_WORKSPACE_SETTINGS.font_mode);
    setMotionMode(DEFAULT_WORKSPACE_SETTINGS.motion_mode);
    setDensity(DEFAULT_WORKSPACE_SETTINGS.density);
    setCustomTheme({ ...DEFAULT_CUSTOM_THEME });
  };

  const resetHomeLayout = () => {
    setHomeLayout(DEFAULT_HOME_LAYOUT.map((item) => ({ ...item })));
  };

  const showAllBoards = () => {
    setHomeLayout((current) => current.map((item) => ({ ...item, visible: true })));
  };

  const visibleBoardCount = homeLayout.filter((item) => item.visible).length;
  const hiddenBoardCount = homeLayout.length - visibleBoardCount;

  const hasAppearanceChanges = themeName !== workspaceSettings.theme_name
    || themeMode !== workspaceSettings.theme_mode
    || wallpaper !== workspaceSettings.wallpaper
    || fontMode !== workspaceSettings.font_mode
    || motionMode !== workspaceSettings.motion_mode
    || density !== workspaceSettings.density
    || JSON.stringify(homeLayout) !== JSON.stringify(workspaceSettings.home_layout)
    || JSON.stringify(customTheme) !== JSON.stringify(workspaceSettings.custom_theme)
    || JSON.stringify(pluginItems.filter((plugin) => plugin.enabled).map((plugin) => plugin.id).sort()) !== JSON.stringify([...workspaceSettings.enabled_plugins].sort());

  const togglePluginEnabled = (pluginId: string) => {
    const enabledIds = new Set(pluginItems.filter((plugin) => plugin.enabled).map((plugin) => plugin.id));
    if (enabledIds.has(pluginId)) enabledIds.delete(pluginId);
    else enabledIds.add(pluginId);
    setPluginItems((current) => current.map((plugin) => plugin.id === pluginId ? { ...plugin, enabled: enabledIds.has(plugin.id) } : plugin));
  };

  const revertWorkspaceAppearance = () => {
    setThemeName(workspaceSettings.theme_name);
    setThemeMode(workspaceSettings.theme_mode);
    setWallpaper(workspaceSettings.wallpaper);
    setFontMode(workspaceSettings.font_mode);
    setMotionMode(workspaceSettings.motion_mode);
    setDensity(workspaceSettings.density);
    setHomeLayout(workspaceSettings.home_layout.map((item) => ({ ...item })));
    setCustomTheme({ ...workspaceSettings.custom_theme });
    setPluginItems(plugins);
  };

  return (
    <section className="grid gap-4">
      <div className="app-panel rounded-[28px] p-6 shadow-soft backdrop-blur">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-2xl app-primary-button p-3"><Settings2 size={18} /></div>
          <div>
            <div className="text-lg font-medium">设置</div>
            <div className="text-sm app-text-secondary">模型、模板、主题、私密笔记与离线更新。</div>
          </div>
        </div>
        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="app-surface-muted rounded-[20px] p-4 text-sm app-text-secondary">
            <div className="mb-1 text-xs font-medium uppercase tracking-[0.2em] app-text-muted">应用版本</div>
            <div className="font-medium">{appInfo.version || '未加载'}</div>
          </div>
          <div className="app-surface-muted rounded-[20px] p-4 text-sm app-text-secondary">
            <div className="mb-1 text-xs font-medium uppercase tracking-[0.2em] app-text-muted">更新目录</div>
            <div className="truncate font-medium">{appInfo.update_staging_path || '未加载'}</div>
          </div>
          <div className="app-surface-muted rounded-[20px] p-4 text-sm app-text-secondary md:col-span-2 xl:col-span-2">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] app-text-muted"><HardDrive size={14} /> 工作区</div>
            <div className="truncate font-medium">{appInfo.workspace_path || '未加载'}</div>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="app-surface rounded-[24px] p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium app-text-secondary"><Database size={16} /> 模型设置</div>
            <div className="space-y-3">
              <input value={config.provider} onChange={(e) => setConfig({ ...config, provider: e.target.value })} className="app-input w-full rounded-2xl px-3 py-2 text-sm" placeholder="服务商" />
              <input value={config.model_name} onChange={(e) => setConfig({ ...config, model_name: e.target.value })} className="app-input w-full rounded-2xl px-3 py-2 text-sm" placeholder="模型名称" />
              <input value={config.base_url} onChange={(e) => setConfig({ ...config, base_url: e.target.value })} className="app-input w-full rounded-2xl px-3 py-2 text-sm" placeholder="接口地址" />
              <input value={config.api_key} onChange={(e) => setConfig({ ...config, api_key: e.target.value })} className="app-input w-full rounded-2xl px-3 py-2 text-sm" placeholder="API Key" />
              <button onClick={() => onUpdateModelConfig(config)} className="app-primary-button w-full rounded-2xl px-4 py-3 text-sm font-medium">保存模型设置</button>
            </div>
          </div>
          <div className="app-surface rounded-[24px] p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium app-text-secondary"><Palette size={16} /> 主题与首页布局</div>
              <div className={`rounded-full px-3 py-1 text-xs font-medium ${hasAppearanceChanges ? 'app-chip-warning' : 'app-surface-soft app-text-secondary'}`}>
                {hasAppearanceChanges ? '有未保存更改' : '已同步'}
              </div>
            </div>
            <div className="space-y-3">
              <input value={themeName} onChange={(e) => setThemeName(e.target.value)} className="app-input w-full rounded-2xl px-3 py-2 text-sm" placeholder="主题名称" />
              <select value={themeMode} onChange={(e) => setThemeMode(e.target.value as WorkspaceSettingsData['theme_mode'])} className="app-select w-full rounded-2xl px-3 py-2 text-sm">
                <option value="warm">暖色</option>
                <option value="forest">森林</option>
                <option value="night">夜色</option>
                <option value="custom">完全自定义</option>
              </select>
              <select value={wallpaper} onChange={(e) => setWallpaper(e.target.value as WorkspaceSettingsData['wallpaper'])} className="app-select w-full rounded-2xl px-3 py-2 text-sm">
                <option value="gradient">渐变背景</option>
                <option value="mouse-parallax">鼠标互动壁纸</option>
                <option value="time-shift">随时间变化</option>
              </select>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="space-y-1 text-sm app-text-secondary">
                  <span>字体风格</span>
                  <select value={fontMode} onChange={(e) => setFontMode(e.target.value as WorkspaceSettingsData['font_mode'])} className="app-select rounded-2xl px-3 py-2 text-sm">
                    <option value="sans">无衬线</option>
                    <option value="serif">衬线</option>
                    <option value="mono">等宽</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm app-text-secondary">
                  <span>动效强度</span>
                  <select value={motionMode} onChange={(e) => setMotionMode(e.target.value as WorkspaceSettingsData['motion_mode'])} className="app-select rounded-2xl px-3 py-2 text-sm">
                    <option value="calm">柔和</option>
                    <option value="vivid">明显</option>
                    <option value="off">关闭</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm app-text-secondary">
                  <span>界面密度</span>
                  <select value={density} onChange={(e) => setDensity(e.target.value as WorkspaceSettingsData['density'])} className="app-select rounded-2xl px-3 py-2 text-sm">
                    <option value="comfortable">舒适</option>
                    <option value="compact">紧凑</option>
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(themePresets) as Array<[Exclude<WorkspaceSettingsData['theme_mode'], 'custom'>, { name: string; colors: CustomThemeTokens }]>).map(([mode, preset]) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setThemeMode(mode);
                      setThemeName(preset.name);
                      setCustomTheme(preset.colors);
                    }}
                    className="app-secondary-button rounded-full px-3 py-1 text-xs"
                  >
                    {mode}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setThemeMode('custom');
                    setThemeName('我的主题');
                    setCustomTheme(DEFAULT_CUSTOM_THEME);
                  }}
                  className="app-secondary-button rounded-full px-3 py-1 text-xs"
                >
                  重置自定义
                </button>
              </div>
              <div className="app-surface-soft rounded-2xl p-3 text-sm app-text-secondary">
                <div className="text-xs uppercase tracking-[0.18em] app-text-muted">体验预览</div>
                <div className="mt-2">当前外观：{fontMode === 'sans' ? '无衬线' : fontMode === 'serif' ? '衬线' : '等宽'} · {motionMode === 'calm' ? '柔和动效' : motionMode === 'vivid' ? '明显动效' : '无动效'} · {density === 'comfortable' ? '舒适密度' : '紧凑密度'}</div>
              </div>
              {themeMode === 'custom' && (
                <div className="app-surface-soft rounded-2xl p-3">
                  <div className="mb-2 text-xs uppercase tracking-[0.18em] app-text-muted">自定义主题色</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {themeColorFields.map((field) => (
                      <label key={field.key} className="space-y-1 text-sm app-text-secondary">
                        <span>{field.label}</span>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            value={customTheme[field.key]}
                            onChange={(event) => setCustomTheme((current) => ({ ...current, [field.key]: event.target.value }))}
                            className="h-11 w-14 cursor-pointer rounded-xl border-0 bg-transparent p-0"
                          />
                          <input
                            value={customTheme[field.key]}
                            onChange={(event) => setCustomTheme((current) => ({ ...current, [field.key]: event.target.value }))}
                            className="app-input rounded-2xl px-3 py-2 text-sm"
                          />
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => setCustomTheme({ ...DEFAULT_CUSTOM_THEME })} className="app-secondary-button rounded-2xl px-4 py-2 text-sm">恢复默认自定义主题</button>
                    <button onClick={resetThemeAppearance} className="app-secondary-button rounded-2xl px-4 py-2 text-sm">恢复默认主题</button>
                  </div>
                </div>
              )}
              <div className="app-surface-soft rounded-2xl p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-[0.18em] app-text-muted">首页板块顺序</div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={showAllBoards} className="app-secondary-button rounded-xl px-3 py-1 text-xs">全部显示</button>
                    <button onClick={resetHomeLayout} className="app-secondary-button rounded-xl px-3 py-1 text-xs">恢复默认布局</button>
                  </div>
                </div>
                <div className="mb-3 flex flex-wrap gap-2 text-xs">
                  <span className="app-chip-success rounded-full px-3 py-1">显示 {visibleBoardCount}</span>
                  <span className="app-surface rounded-full px-3 py-1 app-text-secondary">隐藏 {hiddenBoardCount}</span>
                </div>
                <div className="space-y-2">
                  {homeLayout.map((item, index) => (
                    <div key={item.id} className="app-surface flex items-center justify-between rounded-2xl px-3 py-2 text-sm app-text-secondary">
                      <span>{boardLabels[item.id]}</span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => toggleLayoutItemVisibility(item.id)} className={`rounded-xl px-2 py-1 text-xs ${item.visible ? 'app-chip-success' : 'app-secondary-button'}`}>
                          {item.visible ? '显示中' : '已隐藏'}
                        </button>
                        <button onClick={() => moveLayoutItem(item.id, 'up')} disabled={index === 0} className="app-secondary-button rounded-xl px-2 py-1 disabled:opacity-40">上移</button>
                        <button onClick={() => moveLayoutItem(item.id, 'down')} disabled={index === homeLayout.length - 1} className="app-secondary-button rounded-xl px-2 py-1 disabled:opacity-40">下移</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveWorkspaceAppearance} disabled={!hasAppearanceChanges} className="app-primary-button w-full rounded-2xl px-4 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50">保存主题设置</button>
                <button onClick={revertWorkspaceAppearance} disabled={!hasAppearanceChanges} className="app-secondary-button rounded-2xl px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50">撤销未保存更改</button>
                <button onClick={resetWorkspaceAppearance} className="app-secondary-button rounded-2xl px-4 py-3 text-sm">恢复默认外观</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="app-panel rounded-[24px] p-5 shadow-soft">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium app-text-secondary"><Lock size={16} /> 私密保险箱</div>
          <div className="mb-3 text-sm app-text-secondary">状态：{privateVault.unlocked ? '已解锁' : privateVault.configured ? '已配置，未解锁' : '未配置'}</div>
          {!privateVault.unlocked && (
            <div className="space-y-3">
              <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} className="app-input w-full rounded-2xl px-3 py-2 text-sm" placeholder="输入私密口令" />
              <button onClick={() => onUnlockPrivateVault(passphrase)} className="app-primary-button w-full rounded-2xl px-4 py-3 text-sm font-medium">{privateVault.configured ? '解锁' : '初始化并解锁'}</button>
            </div>
          )}
          {privateVault.unlocked && <button onClick={onLockPrivateVault} className="app-secondary-button w-full rounded-2xl px-4 py-3 text-sm font-medium">重新锁定</button>}
        </div>

        <div className="rounded-[24px] app-panel p-5 shadow-soft xl:col-span-2">
          <div className="mb-3 text-sm font-medium app-text-secondary">模板管理</div>
          <div className="mb-4 grid gap-2 md:grid-cols-[1fr_180px]">
            <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} className="app-input rounded-2xl px-3 py-2 text-sm" placeholder="模板名称" />
            <select value={templateType} onChange={(e) => setTemplateType(e.target.value)} className="app-select rounded-2xl px-3 py-2 text-sm">
              <option value="bullet_journal">子弹笔记</option>
              <option value="note">普通笔记</option>
              <option value="event">时间事件</option>
            </select>
            <textarea value={templateContent} onChange={(e) => setTemplateContent(e.target.value)} className="app-textarea min-h-[120px] rounded-2xl px-3 py-2 text-sm md:col-span-2" />
            <button onClick={() => onSaveTemplate({ name: templateName, icon: templateType === 'bullet_journal' ? '•' : '📝', note_type: templateType, default_title: templateName, default_content: templateContent, metadata: { period_type: templateType === 'bullet_journal' ? 'daily' : null } })} className="app-primary-button rounded-2xl px-4 py-3 text-sm font-medium md:col-span-2">保存模板</button>
          </div>
          <div className="space-y-2">
            {templates.map((template) => (
              <div key={template.id} className="app-surface flex items-center justify-between rounded-2xl px-4 py-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{template.icon} {template.name}</div>
                  <div className="truncate text-xs app-text-secondary">{template.note_type}</div>
                </div>
                <button onClick={() => onDeleteTemplate(template.id)} className="app-danger-soft-button rounded-xl px-3 py-2">删除</button>
              </div>
            ))}
            {templates.length === 0 && <div className="app-surface-muted rounded-2xl px-4 py-4 text-sm app-text-secondary">还没有模板。</div>}
          </div>
        </div>
      </div>

      <div className="rounded-[24px] app-panel p-5 shadow-soft">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium app-text-secondary"><Puzzle size={16} /> 插件</div>
        <div className="mb-3 text-sm app-text-secondary">第一版为声明式插件：从本地插件目录读取 manifest，支持查看和启用状态持久化。</div>
        <div className="mb-3 app-surface-muted rounded-2xl p-4 text-xs app-text-secondary">
          插件目录：{appInfo.plugin_packages_path || '未加载'}
        </div>
        <div className="space-y-2">
          {pluginItems.map((plugin) => (
            <div key={plugin.id} className="app-surface rounded-2xl px-4 py-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{plugin.name} <span className="app-text-secondary">v{plugin.version}</span></div>
                  <div className="mt-1 text-xs app-text-secondary">{plugin.description || '未填写描述'}{plugin.author ? ` · ${plugin.author}` : ''}</div>
                  {plugin.capabilities.length > 0 && <div className="mt-2 text-xs app-text-muted">能力：{plugin.capabilities.join(' · ')}</div>}
                </div>
                <button onClick={() => togglePluginEnabled(plugin.id)} className={`rounded-xl px-3 py-2 text-xs ${plugin.enabled ? 'app-chip-success' : 'app-secondary-button'}`}>
                  {plugin.enabled ? '已启用' : '未启用'}
                </button>
              </div>
            </div>
          ))}
          {pluginItems.length === 0 && <div className="app-surface-muted rounded-2xl px-4 py-4 text-sm app-text-secondary">插件目录里还没有可识别的声明式插件。</div>}
        </div>
      </div>

      <div className="rounded-[24px] app-panel p-5 shadow-soft">
        <div className="app-surface-muted rounded-2xl p-4 text-sm app-text-secondary">
          <div className="flex flex-wrap items-center gap-3">
            <span>当前版本：{updateState.current_version || appInfo.version || '未加载'}</span>
            <span>状态：{updateState.status}</span>
            {updateState.staged_version && <span>待应用：{updateState.staged_version}</span>}
          </div>
          {updateState.last_error && <div className="mt-2 app-text-danger">错误：{updateState.last_error}</div>}
        </div>

        <div className="mt-4 app-surface rounded-2xl p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">GitHub Release 检查</div>
              <div className="text-xs app-text-secondary">读取 latest release 和 update-manifest.json。</div>
            </div>
            <button onClick={onCheckUpdateAvailability} className="app-secondary-button rounded-2xl px-4 py-2 text-sm font-medium">检查更新</button>
          </div>
          <div className="grid gap-2 text-sm app-text-secondary md:grid-cols-2">
            <div>最新版本：{updateAvailability.latest_version || '暂无'}</div>
            <div>是否可更新：{updateAvailability.update_available ? '可更新' : '已最新或未发现版本'}</div>
            {updateAvailability.release_name && <div className="md:col-span-2">发布名称：{updateAvailability.release_name}</div>}
            {updateAvailability.release_url && <a href={updateAvailability.release_url} target="_blank" rel="noreferrer" className="app-link md:col-span-2">打开 Release 页面</a>}
          </div>
          {updateAvailability.packages.length > 0 && (
            <div className="mt-3 space-y-2">
              {updateAvailability.packages.map((pkg) => (
                <div key={`${pkg.name}-${pkg.download_url}`} className="app-surface-soft rounded-2xl px-4 py-3 text-xs app-text-secondary">
                  <div className="font-medium">{pkg.name}</div>
                  <div>类型：{pkg.kind || '未知'} · 大小：{pkg.size_bytes} bytes</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 app-surface rounded-2xl p-4">
          <div className="mb-3 text-sm font-medium">上传本地更新包</div>
          <label className="app-surface-soft flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed px-4 py-3 text-sm app-text-secondary">
            <Upload size={16} />
            <span>{selectedPackageName || '选择本地 .zip 或 .exe 文件并上传'}</span>
            <input
              type="file"
              accept=".zip,.exe"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setSelectedPackageName(file.name);
                void onUploadOfflineUpdate(file);
                event.currentTarget.value = '';
              }}
            />
          </label>
          <div className="mt-2 text-xs app-text-secondary">上传后会把文件暂存到本地更新目录，再进行校验和登记。</div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <input value={String(updateState.package_path || '')} readOnly className="app-input rounded-2xl bg-transparent px-3 py-2 text-sm app-text-secondary" placeholder="上传后自动填写更新包路径" />
          <select value={packageKind} onChange={(e) => setPackageKind(e.target.value)} className="app-select rounded-2xl px-3 py-2 text-sm">
            <option value="portable_zip">portable zip</option>
            <option value="setup_exe">Setup.exe</option>
          </select>
          <input value={stagedVersion} onChange={(e) => setStagedVersion(e.target.value)} className="app-input rounded-2xl px-3 py-2 text-sm" placeholder="目标版本号" />
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button onClick={() => onStageUpdatePackage({ package_path: updateState.package_path || '', package_kind: packageKind, staged_version: stagedVersion, status: 'staged' })} disabled={!updateState.package_path} className="app-primary-button rounded-2xl px-4 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50">校验并暂存更新包</button>
          <button onClick={onApplyUpdatePackage} disabled={!updateState.package_path || updateState.status !== 'staged'} className="app-secondary-button rounded-2xl px-4 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50">退出并应用更新</button>
          <button onClick={onRollbackUpdatePackage} disabled={!Boolean(updateState.manifest?.rollback_available)} className="app-secondary-button rounded-2xl px-4 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50">回滚到上一版本</button>
        </div>
        <div className="mt-3 text-xs app-text-secondary">先上传并校验本地更新包，再点击应用。portable zip 会在重启后覆盖当前应用目录；Setup.exe 会在退出后启动安装程序；portable 更新成功后可触发本地回滚。</div>
      </div>
    </section>
  );
}
