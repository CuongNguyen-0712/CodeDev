// Applies the saved / system theme before the first paint (contexts/themeContext.jsx keeps it in sync afterwards).
// Shared by app/layout.jsx and app/global-not-found.jsx, which renders its own <html>.
export const THEME_SCRIPT = "try{var t=localStorage.getItem('theme');if(t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}";
