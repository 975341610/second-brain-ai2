export type Template = {
  name: string;
  icon: string;
  description: string;
  content: string;
};

export const PRESET_TEMPLATES: Template[] = [
  {
    name: '会议记录 (Meeting Notes)',
    icon: '🗓️',
    description: '记录会议目标、参与者、讨论要点及后续行动项。',
    content: `
      <h1>会议记录：[会议名称]</h1>
      <div data-callout="true"><strong>日期：</strong> ${new Date().toLocaleDateString()} | <strong>参与者：</strong> </div>
      <h2>🎯 会议目标</h2>
      <p>简述本次会议需要解决的核心问题或达成的目标。</p>
      <h2>📝 讨论要点</h2>
      <ul>
        <li>要点 A</li>
        <li>要点 B</li>
      </ul>
      <h2>✅ 后续行动 (Action Items)</h2>
      <ul data-type="taskList">
        <li data-checked="false">任务 1 (@负责人)</li>
        <li data-checked="false">任务 2 (@负责人)</li>
      </ul>
      <h2>📌 备注</h2>
      <p>其他补充信息...</p>
    `,
  },
  {
    name: '周报 (Weekly Report)',
    icon: '📊',
    description: '总结本周进展、遇到的问题以及下周计划。',
    content: `
      <h1>周报：${new Date().toLocaleDateString()}</h1>
      <h2>✨ 本周核心进展</h2>
      <ul>
        <li>完成了项目 A 的层级架构设计</li>
        <li>优化了前端编辑器性能</li>
      </ul>
      <h2>🚧 遇到挑战 & 解决方案</h2>
      <p>在拖拽实现中遇到了递归渲染的性能瓶颈，通过 memo 优化解决。</p>
      <h2>📅 下周计划</h2>
      <ul data-type="taskList">
        <li data-checked="false">完成模板系统开发</li>
        <li data-checked="false">开始单元测试编写</li>
      </ul>
    `,
  },
  {
    name: '项目计划 (Project Plan)',
    icon: '🚀',
    description: '制定项目路线图、阶段里程碑和资源分配。',
    content: `
      <h1>🚀 项目计划：[项目名称]</h1>
      <h2>📋 项目概览</h2>
      <p>简述项目背景、愿景和预期产出。</p>
      <h2>🚩 里程碑 (Milestones)</h2>
      <table style="width: 100%">
        <thead>
          <tr>
            <th>阶段</th>
            <th>截止日期</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>需求调研</td>
            <td>2024-04-01</td>
            <td>已完成</td>
          </tr>
          <tr>
            <td>开发阶段</td>
            <td>2024-05-15</td>
            <td>进行中</td>
          </tr>
        </tbody>
      </table>
      <h2>🔗 相关资源</h2>
      <p>[[设计文档]] | [[API 规范]]</p>
    `,
  },
  {
    name: '读书笔记 (Reading Notes)',
    icon: '📚',
    description: '记录书籍精华、个人感想及行动建议。',
    content: `
      <h1>📚 读书笔记：《书名》</h1>
      <p><strong>作者：</strong> | <strong>评分：</strong> ⭐⭐⭐⭐⭐</p>
      <h2>💡 核心观点</h2>
      <blockquote>在这里记录书中最触动你的 3 个观点。</blockquote>
      <h2>✍️ 精华摘录</h2>
      <p>“书籍是人类进步的阶梯。”</p>
      <h2>🌱 行动建议</h2>
      <ul data-type="taskList">
        <li data-checked="false">应用观点 A 到工作中</li>
      </ul>
    `,
  },
];
