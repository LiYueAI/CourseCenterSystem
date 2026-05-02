export type AiMiniAppTitleGameType = 'quiz' | 'matching' | 'sequence';

export function getDefaultAiMiniAppTitle(gameType: AiMiniAppTitleGameType): string {
  if (gameType === 'matching') {
    return '课堂配对游戏';
  }

  if (gameType === 'sequence') {
    return '课堂排序挑战';
  }

  return '课堂问答闯关';
}
