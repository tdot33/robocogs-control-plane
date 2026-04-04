import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'RoboCOGS Orchestration',
  description: 'Agent task orchestration and gate approval interface',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
