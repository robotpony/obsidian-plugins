import { Notice } from "obsidian";

/**
 * Show a notice with a styled plugin logo badge.
 * Uses a DocumentFragment to render the logo with CSS styling.
 *
 * @param logoPrefix - The logo text to display (e.g., "␣⌘", "H⌘", "L⌘")
 * @param logoClass - CSS class for the logo element (e.g., "space-command-logo")
 * @param message - The message to display
 * @param timeout - Optional timeout in milliseconds
 */
export function showNotice(
  logoPrefix: string,
  logoClass: string,
  message: string,
  timeout?: number
): Notice {
  const fragment = document.createDocumentFragment();

  const logo = document.createElement("span");
  logo.className = logoClass;
  logo.textContent = logoPrefix;
  fragment.appendChild(logo);

  fragment.appendChild(document.createTextNode(" " + message));

  return new Notice(fragment, timeout);
}

/**
 * Create a factory function for showing notices with a specific plugin's branding.
 * This is the preferred pattern for plugins to use.
 *
 * @param logoPrefix - The logo text to display
 * @param logoClass - CSS class for the logo element
 * @returns A function that shows notices with the plugin's branding
 *
 * @example
 * ```ts
 * const showNotice = createNoticeFactory("␣⌘", "space-command-logo");
 * showNotice("Task completed");
 * showNotice("Error occurred", 5000);
 * ```
 */
export function createNoticeFactory(
  logoPrefix: string,
  logoClass: string
): (message: string, timeout?: number) => Notice {
  return (message: string, timeout?: number) =>
    showNotice(logoPrefix, logoClass, message, timeout);
}
