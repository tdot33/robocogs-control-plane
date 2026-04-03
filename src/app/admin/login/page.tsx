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
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-lg p-6">
        <h1 className="text-2xl font-semibold text-slate-900">Control Surface Login</h1>
        <p className="mt-2 text-sm text-slate-600">Sign in to access orchestration controls.</p>

        {errorMessage ? (
          <div className="mt-4 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <form method="POST" action="/api/admin/login" className="mt-5 space-y-4">
          <input type="hidden" name="next" value={nextPath} />
          <label className="block text-sm font-medium text-slate-700">
            Username
            <input
              name="username"
              autoComplete="username"
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-md bg-slate-900 text-white py-2.5 text-sm font-medium hover:bg-slate-800"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  )
}