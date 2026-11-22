export const gameFontFamily = '"Sketch Jua", "Malgun Gothic", sans-serif';

export function loadGameFont() {
  return document.fonts.load('16px "Sketch Jua"', '한글 Noriverse 123').catch(() => []);
}
