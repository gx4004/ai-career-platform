export interface ScreenshotsEnv {
  frontendDir: string
  backendDir: string
  databaseUrl: string
  frontendPort: string
  backendPort: string
  frontendUrl: string
  backendUrl: string
  pythonBin: string
}

export function resolveScreenshotsEnv(): ScreenshotsEnv
