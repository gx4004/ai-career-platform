import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createRootRoute, createRoute, redirect, Outlet } from '@tanstack/react-router'
import './styles.css'
import { LoginPage } from '#/pages/LoginPage'
import { DashboardPage } from '#/pages/DashboardPage'
import { UsersPage } from '#/pages/UsersPage'
import { RunsPage } from '#/pages/RunsPage'
import { AdminShell } from '#/components/AdminShell'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
})

const rootRoute = createRootRoute({ component: () => <Outlet /> })
const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: LoginPage })

const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'shell',
  component: AdminShell,
  beforeLoad: () => {
    const token = localStorage.getItem('admin_token')
    if (!token) throw redirect({ to: '/login' })
  },
})

const indexRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/',
  beforeLoad: () => { throw redirect({ to: '/dashboard' }) },
})
const dashboardRoute = createRoute({ getParentRoute: () => shellRoute, path: '/dashboard', component: DashboardPage })
const usersRoute = createRoute({ getParentRoute: () => shellRoute, path: '/users', component: UsersPage })
const runsRoute = createRoute({ getParentRoute: () => shellRoute, path: '/runs', component: RunsPage })

const routeTree = rootRoute.addChildren([
  loginRoute,
  shellRoute.addChildren([indexRoute, dashboardRoute, usersRoute, runsRoute]),
])

const router = createRouter({ routeTree })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
)
