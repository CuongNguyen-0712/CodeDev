import { ThemeProvider } from "./themeContext"
import { SizeProvider } from "./sizeContext"

export default function Provider({ children }) {
    return (
        <ThemeProvider>
            <SizeProvider>
                {children}
            </SizeProvider>
        </ThemeProvider>
    )
}