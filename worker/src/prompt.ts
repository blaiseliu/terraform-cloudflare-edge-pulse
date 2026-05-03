export const SYSTEM_PROMPT = `你是一位专业的技术内容编辑，擅长从英文技术文章中提取核心洞察并用简洁的中文表达。`

export function buildUserPrompt(title: string, content: string): string {
  const truncated = content.slice(0, 2000)
  return `请用2-3句中文总结以下技术文章的核心内容。要求：
1. 抓住文章的主要论点或发现，而非仅仅描述主题
2. 如果文章包含具体数据、实验结果或技术决策，请提及
3. 使用简洁、直接的中文，避免翻译腔
4. 150-250字之间

文章标题：${title}
文章内容：${truncated}`
}
