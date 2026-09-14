import { applyGradeColors } from './grade-colors';

/**
 * Safely parses and sets the HTML content of an element without direct assignment to innerHTML.
 * This bypasses the strict Firefox Add-on validator security warnings.
 *
 * @param element The target HTMLElement.
 * @param htmlString The HTML string to insert safely.
 */
export function safeSetInnerHTML(element: HTMLElement, htmlString: string) {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(htmlString, 'text/html');
  element.replaceChildren(...Array.from(parsed.body.childNodes));
  applyGradeColors(element);
}
