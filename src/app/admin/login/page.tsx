interface LoginPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearch = (await searchParams) || {}
  const error = typeof resolvedSearch.error === 'string' ? resolvedSearch.error : ''
  const nextPath = typeof resolvedSearch.next === 'string' ? resolvedSearch.next : '/admin/orchestration'

  let errorMessage = ''
  if (error === 'invalid') {
    errorMessage = 'Invalid username or password.'
  } else if (error === 'config') {
    errorMessage = 'Admin auth is not configured. Set ADMIN_UI_* environment variables.'
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_25%),linear-gradient(180deg,#020617_0%,#0f172a_55%,#111827_100%)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950/85 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.55)] backdrop-blur">
        <h1 className="text-2xl font-semibold text-white">Control Surface Login</h1>
        <p className="mt-2 text-sm text-slate-300">Sign in to access orchestration controls.</p>

        {errorMessage ? (
          <div className="mt-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {errorMessage}
          </div>
        ) : null}

        <form method="POST" action="/api/admin/login" className="mt-5 space-y-4">
          <input type="hidden" name="next" value={nextPath} />
          <label className="block text-sm font-medium text-slate-200">
            Username
            <input
              name="username"
              autoComplete="username"
              required
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            />
          </label>
          <label className="block text-sm font-medium text-slate-200">
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-md bg-cyan-500 py-2.5 text-sm font-medium text-slate-950 hover:bg-cyan-400"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  )
}