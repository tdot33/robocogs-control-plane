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
    <div className="flex min-h-screen items-center justify-center bg-[#0d1117] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[#30363d] bg-[#161b22] p-6 shadow-[0_16px_40px_rgba(1,4,9,0.35)]">
        <h1 className="text-2xl font-semibold text-white">Control Surface Login</h1>
        <p className="mt-2 text-sm text-slate-300">Sign in to access orchestration controls.</p>

        {errorMessage ? (
          <div className="mt-4 rounded-md border border-[#6e2f36] bg-[#2d1617] px-3 py-2 text-sm text-[#f85149]">
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
              className="mt-1 w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-[#c9d1d9] focus:outline-none focus:ring-2 focus:ring-[#1f6feb]"
            />
          </label>
          <label className="block text-sm font-medium text-slate-200">
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-[#c9d1d9] focus:outline-none focus:ring-2 focus:ring-[#1f6feb]"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-md bg-[#1f6feb] py-2.5 text-sm font-medium text-white hover:bg-[#388bfd]"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  )
}