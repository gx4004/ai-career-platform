import { Link } from '@tanstack/react-router'

export function LandingFooter() {
  return (
    <footer className="landing-footer glass-subtle">
      <div className="content-max flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="section-title">Career Workbench</p>
          <p className="small-copy muted-copy">Built for thesis research.</p>
        </div>
        <div className="flex gap-4 small-copy">
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/login">Login</Link>
        </div>
      </div>
    </footer>
  )
}
