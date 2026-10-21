import { BrowserRouter } from 'react-router-dom'
import { AppRoutes } from './routes'
import { ErrorBoundary } from './ErrorBoundary'
import { AuthProvider } from '../auth/AuthProvider'

export function App() {
  return <ErrorBoundary><BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter></ErrorBoundary>
}
