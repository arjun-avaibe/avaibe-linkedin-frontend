import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AccountProvider } from '@/context/account'
import { AuthProvider } from '@/context/auth'
import { ThemeProvider, useTheme } from '@/context/theme'
import { TimezoneProvider } from '@/context/timezone'
import App from './App.tsx'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

function ThemedToaster() {
  const { resolved } = useTheme()
  return <Toaster richColors position="top-right" theme={resolved} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <TimezoneProvider>
            <AuthProvider>
              <AccountProvider>
                <App />
              </AccountProvider>
            </AuthProvider>
          </TimezoneProvider>
          <ThemedToaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
