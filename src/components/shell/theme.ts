/** Shared by the server layout (boot script) and the client toggle. Kept out of the "use client" module on purpose. */
export const THEME_STORAGE_KEY = "consensa:theme";
export const themes = ["system", "light", "dark"] as const;
export type Theme = (typeof themes)[number];

/**
 * Runs before first paint (inlined in <head>) so a saved light or dark choice never flashes the
 * other theme. "system" leaves data-theme off and lets PRISM's prefers-color-scheme tokens decide.
 */
export const themeBootScript = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
