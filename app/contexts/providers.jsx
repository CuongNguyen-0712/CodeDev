import { ThemeProvider } from "./themeContext"

export default function Provider({ children }) {
    return (
        <ThemeProvider>
            {children}
        </ThemeProvider>
    )
}