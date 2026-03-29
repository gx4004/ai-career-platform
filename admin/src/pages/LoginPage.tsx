import { useState, type FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { login, setToken, getMe } from '#/lib/api'

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { access_token } = await login(email, password)
      setToken(access_token)

      const me = await getMe()
      if (!me.is_admin) {
        setError('You do not have admin access.')
        localStorage.removeItem('admin_token')
        setLoading(false)
        return
      }

      navigate({ to: '/dashboard' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Admin Login</h1>
        <div className="login-field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="login-field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button type="submit" className="login-btn" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
        {error && <p className="login-error">{error}</p>}
      </form>
    </div>
  )
}
